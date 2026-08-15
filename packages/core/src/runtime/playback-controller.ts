import { AssetManager } from "../assets/manager";
import { Measurer } from "../render/measurer";
import { RenderContext } from "../render/render-context";
import { StateEvaluator, SeekCancel, DEFAULT_REPLAY_BUDGET_MS } from "./state-evaluator";
import { NodeState, TreeState, WaveformInfo, nodePath } from "@/project/tree";
import { AudioRequest } from "@/attributes/audio/request";
import { StorageAdapter } from "../platform/storage-adapter";
import { Precomp, PrecompResult, NodeLifespan, DEFAULT_PRECOMP_BUDGET_MS } from "./precompisition";
import { yieldToScheduler } from "@/util/scheduler";
import { MasterClock, TimeCallback } from "@/platform/master-clock";
import { AudioDevice } from "@/platform/audio-device";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { Node } from "@/nodes/base/node";
import { Scene } from "@/nodes/scene/scene-node";
import { Vector2 } from "@/attributes/layout/vector2";
import { NodeBox, collectBoxes, nodeBox, pickNode } from "./node-picking";
import { NodeTextLayout, nodeTextLayout } from "./text-geometry";

/**
 * Transient prop values layered over a node's evaluated state — see
 * {@link PlaybackController.setNodeOverride}. Keys are prop names the node
 * accepts (`x`, `y`, `rotation`, `width`, …).
 */
export type NodeOverride = Record<string, unknown>;

/** Dependencies injected into `PlaybackController` at construction time. */
export type ControllerParams = {
    renderContext: RenderContext;
    measureScope: Measurer;
    storageAdapter: StorageAdapter;
    masterClock: MasterClock;
    audioDevice: AudioDevice;
    assets: AssetCatalog;
    precomposition: Precomp;
    fps: number;
    viewport: Size2D;
    scenes: Scene[];
    /**
     * Wall-clock ms a scrub's state replay may run before yielding to the event
     * loop (see `StateEvaluator.stateAtAsync`). Defaults to
     * {@link DEFAULT_REPLAY_BUDGET_MS}. Set to `0` in tests to force a yield on
     * every frame, making preemption deterministic.
     */
    replayBudgetMs?: number;
    /**
     * Wall-clock ms the background precomp may run before yielding. Defaults to
     * {@link DEFAULT_PRECOMP_BUDGET_MS}. Set to `0` in tests to force a yield on
     * every precomped frame.
     */
    precompBudgetMs?: number;
    /**
     * Called each time the background precomp measures another scene, with the
     * newly assembled result. Fires until `result.complete` is true. Passed at
     * construction rather than subscribed afterwards so a fast first scene can't
     * publish before the caller has attached.
     */
    onPrecompProgress?: (result: PrecompResult) => void;
};

/**
 * Orchestrates playback of a compiled motion-script project.
 *
 * On construction it runs the precomp pass (`Precomp.run()`) to build the
 * global asset timeline and node lifespans, then wires the master clock to
 * the audio device and render pipeline so every tick:
 *
 * 1. Loads assets required at the current frame (`AssetManager.loadAt`).
 * 2. Evaluates scene state and lays out nodes (`StateEvaluator`).
 * 3. Renders the frame to the render context.
 * 4. Prefetches assets for upcoming frames.
 *
 * External callers interact via `play`, `pause`, `seek`, `seekWhilePlaying`,
 * `screenshot`, `getTreeState`, and `getNodeState`.
 */
export class PlaybackController {
    private renderContext: RenderContext;
    private measureScope: Measurer;
    private storageAdapter: StorageAdapter;
    private masterClock: MasterClock;
    private stateEvaluator: StateEvaluator;
    private assetManager: AssetManager;
    private audioDevice: AudioDevice;
    /** Set by dispose(); once true the controller must never touch its (now-freed) render context again. */
    private disposed = false;
    /**
     * Monotonic token bumped by every seek / tick / seekWhilePlaying. A render
     * pass captures it at entry and, after each await, bails before painting if a
     * newer pass has begun — so a superseded seek (parked on loadAt /
     * warmPendingVideo during a fast scrub) can never stamp its stale frame over
     * the scene a later seek already rendered.
     */
    private seekGeneration = 0;
    /** Time slice for `seek`'s interruptible replay. See {@link ControllerParams.replayBudgetMs}. */
    private readonly replayBudgetMs: number;
    /** Time slice for the background precomp. See {@link ControllerParams.precompBudgetMs}. */
    private readonly precompBudgetMs: number;
    private readonly onPrecompProgress?: (result: PrecompResult) => void;
    /**
     * Set when playback ran off the end of the *measured* timeline while the
     * background precomp was still working. Distinguishes "the project ended"
     * from "we ran out of measured frames", so {@link adoptPrecomp} can resume
     * once more duration lands instead of stranding the user at a false ending.
     */
    private pausedPendingPrecomp = false;
    /** Speed/direction of the last `play`, replayed by an auto-resume. */
    private lastPlaySpeed = 1;
    private lastPlayReverse = false;
    readonly fps: number;
    readonly viewport: Size2D;
    /** The precomp runner, kept so a single scene can be re-run on hot reload. */
    private readonly precomper: Precomp;
    /**
     * Transient prop values re-applied after every state evaluation, keyed by
     * structural path so they survive a scene rebuild. See
     * {@link setNodeOverride}.
     */
    private readonly overrides = new Map<string, NodeOverride>();
    /** Latest assembled precomp result. Swapped wholesale on a scene replace. */
    precomp: PrecompResult;

    /** Per-scene frame counts in timeline order, used to build the track list. */
    get tracks(): number[] {
        return this.precomp.scenes.map(s => s.frameCount);
    }

    /** Total frame count across all scenes. */
    get totalFrames(): number {
        return this.precomp.totalFrames;
    }

    /** Total playback duration in seconds. */
    get totalDuration(): number {
        return this.precomp.totalDuration;
    }

    /** Errors collected during the precomp pass (one entry per failing scene). */
    get buildErrors() {
        return this.precomp.buildErrors;
    }

    /**
     * The project's audio beds as timeline clips, in **absolute** seconds —
     * already bounded by the measured duration, so re-read them whenever it
     * grows. Exposed for the timeline's global track rows; playback schedules
     * the underlying requests itself.
     */
    get globalAudio(): WaveformInfo[] {
        return this.precomp.globalAudio.map(req => ({
            src: req.src,
            startTime: req.startAt,
            endTime: Number.isFinite(req.endAt) ? req.endAt : null,
        }));
    }

    constructor(params: ControllerParams) {
        this.renderContext = params.renderContext;
        this.measureScope = params.measureScope;
        this.masterClock = params.masterClock;
        this.storageAdapter = params.storageAdapter;
        this.audioDevice = params.audioDevice;
        this.fps = params.fps;
        this.viewport = params.viewport;
        this.replayBudgetMs = params.replayBudgetMs ?? DEFAULT_REPLAY_BUDGET_MS;
        this.precompBudgetMs = params.precompBudgetMs ?? DEFAULT_PRECOMP_BUDGET_MS;
        this.onPrecompProgress = params.onPrecompProgress;

        const catalog = params.assets;

        this.precomper = params.precomposition;
        // Measure only the scene that owns frame 0 — that is everything the first
        // painted frame needs. The rest of the project streams in behind it (see
        // startBackgroundPrecomp), so time-to-first-frame is O(one scene) rather
        // than O(whole project). Scenes not yet measured appear as zero-length
        // placeholders, which every consumer below already handles.
        this.precomp = this.precomper.runUntil(i => i === 0);

        this.stateEvaluator = new StateEvaluator(
            params.scenes,
            this.viewport,
            this.fps,
            catalog,
            this.tracks,
            this.measureScope,
            // Read off the precomp rather than taken as a separate param: the two
            // must be the same instance, and there is no way to pass a mismatched
            // pair if only one of them is ever supplied.
            this.precomper.globals,
        );

        this.assetManager = new AssetManager(
            this.precomp,
            this.storageAdapter,
            this.audioDevice,
        );

        this.masterClock.setDuration(this.totalDuration);

        this.masterClock.onPlay((t, speed, reverse) => {
            this.audioDevice.play(t, speed, reverse);
            this.storageAdapter.setPlaying(true);
        });
        this.masterClock.onPause(() => {
            this.audioDevice.stop();
            this.storageAdapter.setPlaying(false);
        });
        this.masterClock.onTick(async (currentTime: number) => {
            // A tick is also a render pass: claim a generation so a stale paused
            // seek can't paint after the clock has moved on (and vice-versa).
            const gen = ++this.seekGeneration;
            const frame = this.fps * currentTime;
            if (frame >= this.totalFrames) {
                // `totalFrames` is only the end of the project once precomp is
                // complete; before that it is just the end of what we've measured.
                // Flag the difference so adoptPrecomp can pick playback back up.
                this.pausedPendingPrecomp = !this.precomp.complete;
                this.masterClock.pause();
            }
            await this.assetManager.loadAt(frame);
            if (!this.isCurrent(gen)) return;
            this.audioDevice.syncTo(currentTime);
            this.renderAt(frame, this.cancelAfter(gen));
            this.assetManager.prefetch(frame);
        });

        this.startBackgroundPrecomp();
    }

    /**
     * Measure the remaining scenes off the critical path, republishing a longer
     * timeline as each one lands.
     *
     * Deferred behind a yield so the caller finishes mounting and the first frame
     * actually paints before this starts competing for the main thread — the
     * whole point of the split is that the user sees something immediately.
     */
    private startBackgroundPrecomp(): void {
        if (this.precomp.complete) return;
        void (async () => {
            await yieldToScheduler();
            if (this.disposed) return;
            const final = await this.precomper.runAsync({
                budgetMs: this.precompBudgetMs,
                isCancelled: () => this.disposed,
                onProgress: result => this.adoptPrecomp(result),
            });
            // `onProgress` already published every scene it measured; this only
            // matters when there was nothing left to measure (every scene served
            // from cache), where no progress callback fires at all.
            if (!this.disposed && !this.precomp.complete) this.adoptPrecomp(final);
        })();
    }

    /**
     * Swap in a newly assembled precomp result and propagate the longer timeline
     * to everything that derives from it.
     *
     * The same three updates {@link replaceScene} performs, minus the scene swap.
     * `setPrecomp` is not optional on any publish: it resets the asset manager's
     * `lastAudioRequestKey`, which is what forces a reschedule of audio whose
     * `endAt` was just re-resolved against the now-longer project.
     */
    private adoptPrecomp(next: PrecompResult): void {
        if (this.disposed) return;
        this.precomp = next;
        this.stateEvaluator.setTracks(this.tracks);
        this.assetManager.setPrecomp(next);
        this.masterClock.setDuration(this.totalDuration);

        // Playback stopped at what was then the end of the world; there is more of
        // it now, so carry on from where it stopped rather than making the user
        // press play again at an arbitrary scene boundary.
        if (this.pausedPendingPrecomp && this.currentFrame < this.totalFrames) {
            this.pausedPendingPrecomp = false;
            this.masterClock.play(this.lastPlaySpeed, this.lastPlayReverse);
        }

        this.onPrecompProgress?.(next);
    }

    get isPlaying(): boolean {
        return this.masterClock.isPlaying;
    }

    /** Current playback position in seconds. */
    get currentTime(): number {
        return this.masterClock.currentTime;
    }

    /** Current playback position in frames (float). */
    get currentFrame(): number {
        return this.masterClock.currentTime * this.fps;
    }

    /** Register a callback that fires on every clock tick with the current time. */
    onTime(cb: TimeCallback): void {
        this.masterClock.onTime(cb);
    }

    /** Register a callback that fires when playback starts. */
    onPlay(cb: () => void): void {
        this.masterClock.onPlay(() => cb());
    }

    /** Register a callback that fires when playback pauses. */
    onPause(cb: () => void): void {
        this.masterClock.onPause(cb);
    }

    /** True while `gen` is still the latest seek/tick and the controller is alive. */
    private isCurrent(gen: number): boolean {
        return !this.disposed && gen === this.seekGeneration;
    }

    /**
     * A {@link SeekCancel} that trips once `gen` is no longer the latest pass.
     * Passed into `renderAt` so the evaluator's frame-by-frame replay loop aborts
     * the moment a newer seek/tick bumps `seekGeneration` (or the controller is
     * disposed) — the synchronous counterpart to the post-await `isCurrent` guards.
     */
    private cancelAfter(gen: number): SeekCancel {
        return () => !this.isCurrent(gen);
    }

    /**
     * Evaluate scene state, lay out nodes, and render `frame` to the render
     * context. Called on every clock tick and also directly by `seek` /
     * `screenshot` to ensure the surface is up-to-date.
     *
     * `isCancelled` is forwarded into the evaluator's replay loop so a backward
     * seek (which replays from frame 0) can be abandoned the instant a newer seek
     * supersedes it. If it trips, we skip layout/render too — the partial state is
     * stale and a newer pass is already rendering.
     */
    private renderAt(frame: number, isCancelled?: SeekCancel): void {
        // A disposed controller's render context has had its CanvasKit surface
        // freed. An in-flight async seek() (StrictMode double-mount / HMR) can
        // resolve after dispose() and try to render into the dead surface, which
        // throws "Cannot pass deleted object as a pointer of type Surface*".
        if (this.disposed) return;
        this.stateEvaluator.stateAt(frame, isCancelled);
        if (isCancelled?.()) return;
        // After the generators, before layout: an override must beat whatever the
        // scene evaluated to, and be visible to the layout pass that follows.
        this.applyOverrides();
        this.stateEvaluator.layout(this.measureScope);
        this.renderContext.execute(() => {
            this.stateEvaluator.render(this.renderContext);
        });
    }

    /**
     * Interruptible twin of {@link renderAt}, used by {@link seek} only.
     *
     * The state replay is time-sliced (`stateAtAsync`) so it yields to the event
     * loop periodically — which is what lets a newer seek actually preempt it.
     * `renderAt`'s synchronous replay can't be cancelled in practice: while it
     * runs, nothing can bump `seekGeneration`, so `isCancelled` never trips.
     *
     * @returns `false` if the replay was superseded — the caller must stop, as
     *          nothing was painted and a newer pass owns the surface.
     */
    private async renderAtAsync(frame: number, isCancelled?: SeekCancel): Promise<boolean> {
        if (this.disposed) return false;
        const reached = await this.stateEvaluator.stateAtAsync(frame, isCancelled, this.replayBudgetMs);
        if (!reached || this.disposed || isCancelled?.()) return false;
        this.applyOverrides();
        this.stateEvaluator.layout(this.measureScope);
        this.renderContext.execute(() => {
            this.stateEvaluator.render(this.renderContext);
        });
        return true;
    }

    /**
     * Jump to `frame`, pausing playback first. Waits for required assets to
     * load before rendering, then prefetches upcoming frames.
     *
     * This is the scrub path, so its state replay runs interruptibly — a fast
     * backward drag supersedes each in-flight seek instead of queueing a full
     * replay per mouse move.
     */
    async seek(frame: number): Promise<void> {
        if (this.disposed) return;
        // Claim this seek's generation. A later seek/tick/seekWhilePlaying bumps
        // the counter, so the checks after each await below see it's no longer
        // current and bail before painting — fixing stale frames (e.g. a video
        // frame) bleeding into a scene a newer seek already rendered.
        const gen = ++this.seekGeneration;
        const clamped = Math.max(0, Math.min(frame, this.totalFrames));
        // Scrubbing is an explicit reposition — drop any pending auto-resume so a
        // scene landing mid-scrub doesn't start playing under the user's cursor.
        this.pausedPendingPrecomp = false;
        this.masterClock.pause();
        this.masterClock.seek(clamped / this.fps);
        await this.assetManager.loadAt(clamped);
        // loadAt is async — this seek may have been superseded (or the controller
        // disposed) while awaiting.
        if (!this.isCurrent(gen)) return;
        if (!(await this.renderAtAsync(clamped, this.cancelAfter(gen)))) return;
        // A cold seek can land on a video timestamp the window hadn't decoded yet;
        // warm the exact frame(s) the render requested and re-render so the still
        // is frame-accurate. Bounded — decoding is monotonic, so this settles fast.
        // Stays on the synchronous renderAt: the replay above already reached
        // `clamped`, so stateAt hits its early return and this is layout+render only.
        for (let pass = 0; pass < 3; pass++) {
            if (!(await this.storageAdapter.warmPendingVideo())) break;
            if (!this.isCurrent(gen)) return;
            this.renderAt(clamped, this.cancelAfter(gen));
        }
        if (!this.isCurrent(gen)) return;
        this.assetManager.prefetch(clamped);
    }

    /**
     * Hot-reload a single scene in place.
     *
     * Re-runs **only** the edited scene's precomp (reusing every other scene's
     * cached pass), swaps it into the state evaluator's matching slot, and
     * refreshes the asset manager and clock duration. Untouched scenes keep
     * their cached generators, so editing scene N never re-runs scenes ≠ N.
     *
     * The render context is never torn down, so the next render paints the new
     * frame over the old with no blank flash. Returns the resolved scene index,
     * or -1 if no slot matched (caller can fall back to a full reload).
     *
     * The edited scene's precomp re-runs a fresh asset pass, so any asset the
     * edit *added* (a new image/video/font) is now in the global asset map — but
     * it isn't loaded yet. We repaint synchronously for a no-flash swap of what's
     * already warm, then kick off an async `loadAt` for the current frame and
     * re-render once the new assets are ready, so the added asset actually shows
     * up. The async pass is generation-guarded so a concurrent seek/tick wins.
     *
     * @param newScene The edited scene instance (carries `__sceneHotId`).
     */
    replaceScene(newScene: Scene): number {
        if (this.disposed) return -1;

        // Claim a generation *before* touching the evaluator, not just before the
        // repaint below. An async seek parked on a yield re-checks its generation
        // the instant it resumes, so bumping first guarantees it unwinds rather
        // than stepping a generator we are about to swap out. (Safe today even if
        // bumped later, since this method is wholly synchronous — but that is a
        // property of the current code, not a contract. Keep the bump first.)
        const gen = ++this.seekGeneration;

        const scenes = this.precomper.sceneList;
        // Match by stable hot id first; fall back to scene name (class name).
        let index = newScene.__sceneHotId
            ? scenes.findIndex(s => s.__sceneHotId === newScene.__sceneHotId)
            : -1;
        if (index < 0) index = scenes.findIndex(s => s.name === newScene.name);
        if (index < 0) return -1;

        this.precomp = this.precomper.replaceScene(this.precomp, index, newScene);
        this.stateEvaluator.replaceScene(index, newScene, this.tracks);
        this.assetManager.setPrecomp(this.precomp);
        this.masterClock.setDuration(this.totalDuration);

        // Repaint the current frame against the edited scene. The generation
        // claimed at the top of this method already invalidated any in-flight
        // render, so none can stamp a stale frame over the reloaded scene.
        // Deliberately synchronous — the no-flash swap depends on painting the
        // new scene in the same task that installed it.
        const frame = this.currentFrame;
        this.renderAt(frame, this.cancelAfter(gen));

        // Load any newly-tracked assets for this frame and repaint with them.
        // Fire-and-forget: the synchronous repaint above already showed the warm
        // state; this fills in assets the edit added. If a seek/tick supersedes
        // us mid-load, the generation guards bail before painting.
        void this.loadAndRepaint(frame, gen);
        return index;
    }

    /**
     * Await the asset manager's load for `frame`, then repaint — used by
     * {@link replaceScene} so an asset added by a hot reload is loaded before it
     * needs to render. Guarded by `gen`: if a newer seek/tick has begun (or the
     * controller is disposed) we abandon both the post-load render and any video
     * warm-up so we never stamp a stale frame over the live one.
     */
    private async loadAndRepaint(frame: number, gen: number): Promise<void> {
        try {
            await this.assetManager.loadAt(frame);
        } catch (err) {
            console.error("[PlaybackController] hot-reload asset load failed:", err);
            return;
        }
        if (!this.isCurrent(gen)) return;
        this.renderAt(frame, this.cancelAfter(gen));
        // A newly-added video lands on a timestamp the window hasn't decoded yet;
        // warm the exact frame(s) the render asked for and repaint, as seek does.
        for (let pass = 0; pass < 3; pass++) {
            if (!(await this.storageAdapter.warmPendingVideo())) break;
            if (!this.isCurrent(gen)) return;
            this.renderAt(frame, this.cancelAfter(gen));
        }
    }

    /** Reposition the clock to `frame` without interrupting playback. */
    seekWhilePlaying(frame: number): void {
        // Invalidate any in-flight paused seek so its late render can't paint over
        // the live playback position we're repositioning to.
        ++this.seekGeneration;
        const clamped = Math.max(0, Math.min(frame, this.totalFrames));
        this.masterClock.seek(clamped / this.fps);
    }

    /**
     * Capture the current frame as a base-64 PNG data URL. Forces a fresh
     * render before snapshotting because the WebGL drawing buffer may have
     * been cleared since the last tick (we don't set `preserveDrawingBuffer`).
     * Uses `stateEvaluator.currentFrame` (integer) rather than the clock's
     * float so `stateAt` always hits its early-return and never resets scene state.
     */
    screenshot(): string | undefined {
        this.renderAt(this.stateEvaluator.currentFrame);
        return this.renderContext.screenshot();
    }

    /**
     * Return the full node tree for the current scene, with lifespan frame
     * ranges and waveform data attached. Used by the timeline UI.
     * Returns `null` when no scene is active.
     */
    getTreeState(): TreeState | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const sceneIndex = this.stateEvaluator.currentSceneIndex;
        const scenePrecomp = sceneIndex >= 0 ? this.precomp.scenes[sceneIndex] : undefined;
        const audioRequests = scenePrecomp?.audioRequests ?? [];
        // Bound each node's bar to its lifespan: the precomp records scene-local
        // frame ranges, which we shift by the scene's global startFrame so bars
        // land within the scene's slot on the full timeline.
        const lifespans = scenePrecomp?.lifespans;
        const sceneStart = scenePrecomp?.startFrame ?? 0;
        // The precomp requests are the complete audio picture (the per-frame node
        // hook only sees sounds active on the current frame), so they drive the
        // waveforms — grouped by the emitting node's path so each clip lands on
        // its own bar (a Video's clip on the Video row, a scene's playSound on
        // the scene row). Requests with no owner fall back to the scene root.
        const waveformsByPath = waveformsByOwner(audioRequests);
        // A scene is no longer a node — its world lives on `scene.root`. Walk the
        // root so structural paths (path "" = root) match how precomp records
        // lifespans, keeping the per-node bars aligned.
        const tree = nodeToTreeState(scene.root, "", lifespans, sceneStart, waveformsByPath);
        return tree;
    }

    getNodeState(nodeId: string): NodeState | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const node = findNode(scene.root, nodeId);
        if (!node) return null;
        return { id: node.id, type: node.name, properties: node.properties };
    }

    // ---- Direct manipulation ----------------------------------------------
    // Where a node's pixels are, what is under a point, and a write path fast
    // enough for a drag. See `runtime/node-picking.ts` for the geometry.

    /**
     * The on-screen box of one node at the current frame, or `null` when the path
     * does not resolve (or no scene is active). See {@link NodeBox}.
     *
     * @param path Structural path from {@link TreeState.path}.
     */
    getNodeBox(path: string): NodeBox | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const node = findNodeByPath(scene.root, path);
        return node ? nodeBox(node, path) : null;
    }

    /**
     * Every visible node's box in draw order — for hover highlights, marquee
     * selection, and snap guides. One tree walk instead of N {@link getNodeBox}
     * calls.
     */
    getNodeBoxes(): NodeBox[] {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return [];
        const out: NodeBox[] = [];
        collectBoxes(scene.root, "", out, true);
        return out;
    }

    /**
     * Where a Text node's caret slots landed on screen, or `null` when the path
     * doesn't resolve, the node isn't text, or the shape has no caret model (see
     * {@link Measurer.layoutTextBlock}). See {@link NodeTextLayout}.
     *
     * Measured on demand rather than carried with every frame: a host wants this
     * only while a text edit is open, and only for the node being edited.
     *
     * @param path Structural path from {@link TreeState.path}.
     */
    getTextLayout(path: string): NodeTextLayout | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const node = findNodeByPath(scene.root, path);
        return node ? nodeTextLayout(node, path, this.measureScope) : null;
    }

    /**
     * The topmost node under a viewport-space point (origin at the viewport
     * centre, y-up), or `null`. `tolerance` is grab-slop in **scene units** —
     * pass the host's pixel slop divided by its preview zoom so the grab area
     * stays constant on screen. See {@link pickNode}.
     */
    pickNode(point: Vector2, tolerance = 0): NodeBox | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        return pickNode(scene.root, point, tolerance);
    }

    /**
     * Layer transient prop values over a node, on top of whatever the scene's
     * generators evaluate to. Re-applied after every state evaluation and before
     * layout, so they hold across frame changes and backward-seek replays until
     * cleared.
     *
     * This exists for direct manipulation: an editor dragging a node needs the
     * rendered node to follow the pointer at pointer rate, and rebuilding the
     * `Scene` for that is not viable — a host's `scenes` array is an input to the
     * player's mount effect, so a rebuild disposes and re-creates the render
     * surface. Overrides move the live node instead: no precomp, no teardown.
     *
     * They are **not** persistence. The host commits the value to its own model
     * on drop and clears the override; the next rebuild carries the same value in
     * through the scene, and nothing is left behind.
     *
     * @param path  Structural path from {@link TreeState.path} (stable across
     *              rebuilds, unlike a node id).
     * @param props Any props the node accepts — `{ x, y }`, `{ rotation }`,
     *              `{ width, height }`. Merged over any existing override.
     */
    setNodeOverride(path: string, props: NodeOverride): void {
        const existing = this.overrides.get(path);
        this.overrides.set(path, existing ? { ...existing, ...props } : { ...props });
        this.applyOverrides();
    }

    /**
     * Drop one node's overrides, or all of them when `path` is omitted, and
     * repaint so the node snaps back to its scene-authored state.
     *
     * An override is written straight onto a live signal, so simply forgetting it
     * would leave the last dragged value on screen. The value can only come back
     * from the generator that authored it, which means replaying the current
     * scene — so this rebuilds that scene's node tree (node `id`s change; keep
     * keying on paths). Cheap enough for a pointer-*up*, which is the only place
     * it belongs; never call it per `pointermove`.
     */
    clearNodeOverrides(path?: string): void {
        const cleared = path === undefined
            ? (this.overrides.size > 0 && (this.overrides.clear(), true))
            : this.overrides.delete(path);
        // Nothing was held, so nothing is stale — skip the replay entirely.
        if (!cleared) return;
        const frame = this.stateEvaluator.currentFrame;
        this.stateEvaluator.invalidate();
        this.renderAt(frame);
    }

    /**
     * Re-lay-out and repaint the current frame without re-running any generator.
     * Cheap enough for a pointer-rate drag loop: `stateAt` early-returns for the
     * frame that is already current, so this is layout + draw only.
     */
    repaint(): void {
        this.renderAt(this.stateEvaluator.currentFrame);
    }

    /** Write every held override onto its node. No-op when none are set. */
    private applyOverrides(): void {
        if (this.overrides.size === 0) return;
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return;
        for (const [path, props] of this.overrides) {
            findNodeByPath(scene.root, path)?.set(props as never);
        }
    }

    play(speed: number = 1, reverse: boolean = false): void {
        this.lastPlaySpeed = speed;
        this.lastPlayReverse = reverse;
        this.pausedPendingPrecomp = false;
        if (this.currentFrame >= this.totalFrames) {
            this.seek(0).then(() => this.masterClock.play(speed, reverse)).catch(() => { });
            return;
        }
        this.masterClock.play(speed, reverse);
    }

    pause(): void {
        // An explicit pause outranks a pending auto-resume: the user asked to stop.
        this.pausedPendingPrecomp = false;
        this.masterClock.pause();
    }

    setMuted(muted: boolean): void {
        this.audioDevice.setMuted(muted);
    }

    dispose(): void {
        this.disposed = true;
        this.masterClock.dispose();
        this.audioDevice.dispose();
        this.stateEvaluator.dispose();
        this.assetManager.dispose();
    }
}

// Every Node is a container (children may be empty); kept for callers that
// want an explicit "has children" check.
export function isParentNode(node: Node): boolean {
    return node.children.length > 0;
}

function nodeToTreeState(
    node: Node,
    path: string,
    lifespans?: ReadonlyMap<string, NodeLifespan>,
    sceneStart = 0,
    waveformsByPath?: ReadonlyMap<string, WaveformInfo[]>,
): TreeState {
    const state: TreeState = {
        id: node.id,
        path,
        type: node.name,
        children: node.children.map((c, i) =>
            nodeToTreeState(c, nodePath(path, i), lifespans, sceneStart, waveformsByPath)),
    };
    // Waveforms come from the precomp requests (authoritative full timeline),
    // attributed to this node by its structural path.
    const waveform = waveformsByPath?.get(path);
    if (waveform && waveform.length > 0) state.waveform = waveform;
    // Look the lifespan up by structural path (ids are not stable across the
    // precomp/playback rebuilds) and shift it into absolute timeline frames.
    const span = lifespans?.get(path);
    if (span) {
        state.startFrame = sceneStart + span.startFrame;
        state.endFrame = sceneStart + span.endFrame;
    }
    return state;
}

/**
 * Group a scene's audio requests into per-node waveform entries, keyed by the
 * emitting node's structural path (see {@link AudioRequest.ownerPath}). A request
 * with no owner is attributed to the scene root (""), so anything emitted outside
 * a node walk still shows on the scene's bar.
 */
function waveformsByOwner(requests: readonly AudioRequest[]): Map<string, WaveformInfo[]> {
    const byPath = new Map<string, WaveformInfo[]>();
    for (const req of requests) {
        const path = req.ownerPath ?? "";
        const info: WaveformInfo = {
            src: req.src,
            startTime: req.startAt,
            endTime: Number.isFinite(req.endAt) ? req.endAt : null,
        };
        const list = byPath.get(path);
        if (list) list.push(info);
        else byPath.set(path, [info]);
    }
    return byPath;
}

/**
 * Resolve a structural path (`""` = root, `"0.2"` = third child of the first) to
 * its node, or `null` when the tree no longer has that slot. The counterpart to
 * {@link nodePath}, which builds the same keys during the tree walk.
 */
function findNodeByPath(root: Node, path: string): Node | null {
    if (path === "") return root;
    let node: Node = root;
    for (const seg of path.split(".")) {
        const next = node.children[Number(seg)];
        if (!next) return null;
        node = next;
    }
    return node;
}

function findNode(root: Node, id: string): Node | null {
    if (root.id === id) return root;

    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }

    return null;
}
