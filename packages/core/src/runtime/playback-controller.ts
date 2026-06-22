import { AssetManager } from "../assets/manager";
import { MeasureScope } from "../render/measure-scope";
import { RenderContext } from "../render/render-context";
import { StateEvaluator, SeekCancel } from "./state-evaluator";
import { NodeState, TreeState, WaveformInfo, nodePath } from "@/project/tree";
import { AudioRequest } from "@/attributes/audio/request";
import { StorageAdapter } from "../platform/storage-adapter";
import { Precomp, PrecompResult, NodeLifespan } from "./precompisition";
import { Scene } from "@/nodes/base/scene-node";
import { MasterClock, TimeCallback } from "@/platform/master-clock";
import { AudioDevice } from "@/platform/audio-device";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { Node } from "@/nodes/base/node";
/** Dependencies injected into `PlaybackController` at construction time. */
export type ControllerParams = {
    renderContext: RenderContext;
    measureScope: MeasureScope;
    storageAdapter: StorageAdapter;
    masterClock: MasterClock;
    audioDevice: AudioDevice;
    assets: AssetCatalog;
    precomposition: Precomp;
    fps: number;
    viewport: Size2D;
    scenes: Scene[];
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
    private measureScope: MeasureScope;
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
    readonly fps: number;
    readonly viewport: Size2D;
    /** The precomp runner, kept so a single scene can be re-run on hot reload. */
    private readonly precomper: Precomp;
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

    constructor(params: ControllerParams) {
        this.renderContext = params.renderContext;
        this.measureScope = params.measureScope;
        this.masterClock = params.masterClock;
        this.storageAdapter = params.storageAdapter;
        this.audioDevice = params.audioDevice;
        this.fps = params.fps;
        this.viewport = params.viewport;

        const catalog = params.assets;

        this.precomper = params.precomposition;
        this.precomp = this.precomper.run();

        this.stateEvaluator = new StateEvaluator(
            params.scenes,
            this.viewport,
            this.fps,
            catalog,
            this.tracks,
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
                this.masterClock.pause();
            }
            await this.assetManager.loadAt(frame);
            if (!this.isCurrent(gen)) return;
            this.audioDevice.syncTo(currentTime);
            this.renderAt(frame, this.cancelAfter(gen));
            this.assetManager.prefetch(frame);
        });
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
        this.stateEvaluator.layout(this.measureScope);
        this.renderContext.execute(() => {
            this.stateEvaluator.render(this.renderContext);
        });
    }

    /**
     * Jump to `frame`, pausing playback first. Waits for required assets to
     * load before rendering, then prefetches upcoming frames.
     */
    async seek(frame: number): Promise<void> {
        if (this.disposed) return;
        // Claim this seek's generation. A later seek/tick/seekWhilePlaying bumps
        // the counter, so the checks after each await below see it's no longer
        // current and bail before painting — fixing stale frames (e.g. a video
        // frame) bleeding into a scene a newer seek already rendered.
        const gen = ++this.seekGeneration;
        const clamped = Math.max(0, Math.min(frame, this.totalFrames));
        this.masterClock.pause();
        this.masterClock.seek(clamped / this.fps);
        await this.assetManager.loadAt(clamped);
        // loadAt is async — this seek may have been superseded (or the controller
        // disposed) while awaiting.
        if (!this.isCurrent(gen)) return;
        this.renderAt(clamped, this.cancelAfter(gen));
        // A cold seek can land on a video timestamp the window hadn't decoded yet;
        // warm the exact frame(s) the render requested and re-render so the still
        // is frame-accurate. Bounded — decoding is monotonic, so this settles fast.
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
     * @param newScene The edited scene instance (carries `__sceneHotId`).
     */
    replaceScene(newScene: Scene): number {
        if (this.disposed) return -1;

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

        // Repaint the current frame against the edited scene. Bumping the seek
        // generation invalidates any in-flight async render so it can't stamp a
        // stale frame over the reloaded scene.
        const gen = ++this.seekGeneration;
        this.renderAt(this.currentFrame, this.cancelAfter(gen));
        return index;
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

    play(speed: number = 1, reverse: boolean = false): void {
        if (this.currentFrame >= this.totalFrames) {
            this.seek(0).then(() => this.masterClock.play(speed, reverse)).catch(() => { });
            return;
        }
        this.masterClock.play(speed, reverse);
    }

    pause(): void {
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

function findNode(root: Node, id: string): Node | null {
    if (root.id === id) return root;

    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }

    return null;
}
