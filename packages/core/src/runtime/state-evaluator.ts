import { RenderPass2D } from "@/render/render-context2d";
import { Size2D } from "@/attributes/layout/size";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { Measurer2D } from "@/render/measurer";
import { Scene } from "@/nodes/scene/scene-node";
import type { AttachScope } from "@/nodes/node/node";
import { ProjectGlobals } from "./globals";

/**
 * Returns `true` when the in-progress seek has been superseded.
 *
 * Vestigial: an evaluation is a single call, so there is no longer a window in
 * which to cancel one. Kept because callers pass it, and honoured as an
 * early-out before any work happens.
 */
export type SeekCancel = () => boolean;

/** Per-scene state: the built tree, and where it currently stands. */
type SceneSlot = {
    scene: Scene;
    /** Position of this slot in the timeline; the scene index global layers filter on. */
    index: number;
    /** Absolute frame this scene starts at in the global timeline. */
    startFrame: number;
    /** Inclusive last frame for this scene (startFrame + duration - 1). */
    endFrame: number;
    /** Whether the scene's tree has been built (and its timeline compiled). */
    built: boolean;
    /** Local frame this slot was last evaluated at, or -1. */
    localFrame: number;
};

/**
 * Puts scenes into the state for a frame and exposes it for layout and
 * rendering. The playback engine `PlaybackController` calls on every tick and
 * on every seek.
 *
 * Each scene gets a `SceneSlot`. A slot is **built once** — its tree
 * instantiated and its timeline compiled — and thereafter every frame is a
 * question asked of it. There is no replay: no walk from the last position, no
 * teardown when the target is behind, no time-slicing, and no cancellation,
 * because there is nothing long-running to interrupt. A seek costs the same
 * whichever direction the playhead moved and however far.
 *
 * Call order per frame:
 * 1. `stateAt(frame)` — put the owning scene into the state for that frame.
 * 2. `layout(scope)` — lay out the current scene's node tree.
 * 3. `render(context)` — draw the current scene into the render context.
 */
export class StateEvaluator {
    private scenes: Scene[];
    private slots: SceneSlot[] = [];
    private _currentFrame: number = 0;
    private fps: number;
    private viewport: Size2D;
    private assets: AssetCatalog;
    /**
     * Text-measurement scope for the internal layout passes {@link stateAt} runs.
     * Held here (not just passed into the public {@link layout}) because motion
     * priming lays out twice per frame — see {@link evaluateSlot}.
     */
    private measurer: Measurer2D;
    /**
     * The project's background/overlay layers, drawn around every scene. Not part
     * of any scene tree — see {@link ProjectGlobals} — so the evaluator drives
     * them itself, selecting the ones that apply as it enters each scene.
     */
    private readonly globals?: ProjectGlobals;
    /** Set by {@link dispose}; stops any further evaluation of torn-down scenes. */
    private disposed = false;

    /** Most-recently evaluated global frame (integer). */
    get currentFrame() {
        return this._currentFrame;
    }

    private readonly stage: CanvasStage;

    /**
     * @param scenes  Scene list in timeline order.
     * @param viewport Render viewport size; passed to each scene on init.
     * @param fps     Frames per second — used to convert frames ↔ seconds.
     * @param assets  Asset catalog bound to scenes before each evaluation.
     * @param tracks  Per-scene frame counts in timeline order (one entry per
     *                scene). Used to build global frame ranges so `stateAt`
     *                can jump directly to the owning scene without scanning.
     * @param measurer Text-measurement scope for the internal layout passes
     *                {@link stateAt} runs (see {@link evaluateSlot}).
     * @param globals The project's global layers/audio. Pass the **same instance**
     *                the {@link Precomp} was given (`precomp.globals`), so the
     *                layers that draw are the ones whose assets were measured.
     */
    constructor(
        scenes: Scene[],
        viewport: Size2D,
        fps: number,
        assets: AssetCatalog,
        tracks: number[],
        measurer: Measurer2D,
        globals?: ProjectGlobals,
    ) {
        this.fps = fps;
        this.viewport = viewport;
        this.scenes = scenes;
        this.assets = assets;
        this.measurer = measurer;
        this.globals = globals;
        this.stage = new CanvasStage(viewport, fps);

        for (const s of scenes) s.setViewport(viewport);
        globals?.setViewport(viewport);

        let offset = 0;
        for (let i = 0; i < scenes.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots.push({
                scene: scenes[i],
                index: i,
                startFrame: offset,
                endFrame: offset + duration - 1,
                built: false,
                localFrame: -1,
            });
            offset += duration;
        }

        if (this.slots.length > 0) {
            this._currentScene = this.slots[0].scene;
            this.selectGlobals(0);
        }
    }

    /**
     * Point the global layer stacks at the layers that apply to scene `index`,
     * and bring them up to date with the catalog/context.
     *
     * Called whenever the evaluator enters a scene. Cheap — the selection is a
     * filter over a handful of entries and the binds early-return once bound —
     * so it runs on every replay rather than being guarded by a "did the scene
     * change" flag that a hot-reload scene swap could invalidate.
     */
    private selectGlobals(index: number): void {
        const globals = this.globals;
        if (!globals) return;
        const scene = this.scenes[index];
        globals.select(index, scene?.name ?? `Scene ${index}`);
        globals.attach(this.scopeAt(0));
    }

    /**
     * The attach scope for `time` — the catalog and (empty) root context every
     * pass uses, plus the clock reading.
     *
     * Built per call rather than kept: `attach` reads it synchronously and never
     * retains it, and the alternative is a mutable object two clocks share, which
     * is exactly the bug the scene-local/project-absolute split exists to avoid.
     */
    private scopeAt(time: number): AttachScope {
        return { assets: this.assets, context: ContextMap.EMPTY, time };
    }

    private _currentScene!: Scene;

    public get currentScene(): Scene {
        return this._currentScene;
    }

    /** Index of the current scene in the scenes array, or -1 if none. */
    public get currentSceneIndex(): number {
        return this.scenes.indexOf(this._currentScene);
    }

    private get dt() {
        return 1 / this.fps;
    }

    /** Find the slot that owns the given global frame. */
    private slotAt(frame: number): SceneSlot | null {
        for (const slot of this.slots) {
            if (frame >= slot.startFrame && frame <= slot.endFrame) return slot;
        }
        // Past the last frame — fall back so currentScene stays valid. It must be
        // the last **non-empty** slot, not simply the last one: while a background
        // precomp is still measuring, scenes it hasn't reached sit at duration 0
        // (`endFrame = startFrame - 1`, so they match nothing above). Returning one
        // of those would make `stateAt` build and drive a scene the precomp
        // pass is about to run itself — the exact collision the sequential
        // invariant exists to prevent (see `Precomp`'s class doc).
        for (let i = this.slots.length - 1; i >= 0; i--) {
            if (this.slots[i].endFrame >= this.slots[i].startFrame) return this.slots[i];
        }
        // Every slot is empty: either a genuinely zero-length project, or nothing
        // has been measured yet. Slot 0 is the only safe choice — it is the one the
        // sequential pass measures first, so it can never be mid-flight elsewhere.
        return this.slots[0] ?? null;
    }

    /**
     * Build a slot's node tree, once.
     *
     * This is what constructs the scene's nodes and compiles its timeline —
     * everything a later evaluation only *asks*. It used to be `resetSlot`, and
     * it ran again on every backward seek, because a generator can only be
     * advanced: reaching an earlier frame meant throwing the tree away and
     * replaying from zero, which made a backward scrub cost more the deeper into
     * a scene it happened. A driver is asked for a time, so there is nothing to
     * rewind and nothing to rebuild.
     */
    private buildSlot(slot: SceneSlot): void {
        slot.scene.reset();
        slot.scene.attach(this.scopeAt(0));
        this.stage.reset();
        this.stage.build(slot.scene);
        // attach(0) above ran before build() created the nodes, so seed their
        // sampling history now (zero velocity).
        slot.scene.sample();
        // Lay out before compiling: a command that pins to a rendered box reads
        // it as it is built, and every box is zero until this pass has run. See
        // `SceneDriver.compile`.
        this.layoutScene(slot.scene);
        slot.scene.compile();
        this.layoutScene(slot.scene);
        // Layers run on the project clock, so a slot built at its scene's local
        // frame 0 still puts them at that scene's *global* start — a bed's fade or
        // a background video is continuous across the cut rather than restarting.
        this.globals?.attach(this.scopeAt(slot.startFrame * this.dt));
        this.globals?.sample();
        this.layoutGlobals();
        slot.built = true;
        slot.localFrame = 0;
    }

    /** Lay the active global layers out against the full viewport. */
    private layoutGlobals(scope: Measurer2D = this.measurer): void {
        if (!this.globals) return;
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        this.globals.layout(bounds, scope);
    }

    /**
     * Lay out a scene's node tree against the full viewport with the retained
     * measure scope. Shared by the public {@link layout} (render pass) and the
     * two internal passes {@link evaluateSlot} runs to prime motion.
     */
    private layoutScene(scene: Scene): void {
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        scene.layout(bounds, this.measurer);
    }

    /** Lay out the current scene's node tree — and the active global layers — against the full viewport. */
    layout(scope: Measurer2D = this.measurer) {
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        this.currentScene.layout(bounds, scope);
        this.layoutGlobals(scope);
    }

    /**
     * Draw the frame: global backgrounds, the current scene, then global
     * overlays.
     *
     * The scene paints its own `fill` over the backgrounds, so a background only
     * shows through where that fill is absent (the default) or translucent — and
     * because the layers sit outside the scene root, neither is touched by the
     * scene camera or its clip.
     */
    render(context: RenderPass2D) {
        this.globals?.backgrounds.render(context);
        this.currentScene.render(context);
        this.globals?.overlays.render(context);
    }

    /**
     * Put state at the given global `frame`.
     *
     * One call, whichever direction the playhead moved and however far: the
     * owning slot is built if it never has been, then asked for the time. The
     * cost is O(the scene's commands), not O(frames since the start), which is
     * the whole reason the document model exists.
     *
     * @param frame Global frame index (float accepted; fractional part ignored).
     * @param isCancelled Optional predicate, checked once before any work.
     */
    stateAt(frame: number, isCancelled?: SeekCancel): void {
        if (this.disposed || isCancelled?.()) return;

        const clampedFrame = Math.max(0, Math.floor(frame));
        const slot = this.slotAt(clampedFrame);
        if (!slot) return;

        // Already here, and the tree exists: an evaluation is idempotent, so
        // repeating it would only cost. {@link invalidate} clears the memo when a
        // caller needs the frame written again.
        if (clampedFrame === this._currentFrame && slot.built) return;

        this._currentScene = slot.scene;
        // Before the build below, so the layers it primes and lays out are
        // already the ones this scene includes.
        this.selectGlobals(slot.index);

        if (!slot.built) this.buildSlot(slot);

        this.evaluateSlot(slot, clampedFrame - slot.startFrame);
        this._currentFrame = clampedFrame;
    }

    /**
     * Asynchronous form, kept for callers that await a seek.
     *
     * There is nothing left to time-slice. That apparatus - a budget, yields
     * between frames, re-validation after each one - existed because a replay's
     * length was unbounded and had to stay interruptible; an evaluation is a
     * single call, so cancellation has nothing to cancel.
     *
     * @returns `true` unless the evaluator was disposed or the seek was
     *          superseded before it began.
     */
    async stateAtAsync(frame: number, isCancelled?: SeekCancel): Promise<boolean> {
        if (this.disposed || isCancelled?.()) return false;
        this.stateAt(frame);
        return !this.disposed;
    }

    /**
     * Force the next {@link stateAt} to re-evaluate rather than early-return.
     *
     * Needed by `PlaybackController.clearNodeOverrides`: an override is written
     * straight onto a live signal, so the way back to the document's value is to
     * let the timeline write it again. That used to mean a genuine replay from
     * the slot's frame 0; now an evaluation restores every animated node from its
     * baseline anyway, so dropping the frame memo is the whole of it.
     *
     * @internal
     */
    invalidate(): void {
        this._currentFrame = -1;
    }

    /**
     * Put `slot` into the state for `localFrame`.
     *
     * ### Two clocks, deliberately
     * The scene runs on **scene time** and the global layers on **project time**.
     * That split is what makes a scene independent of where it sits: rendered on
     * its own, or third in a timeline, it is handed exactly the same clock and so
     * produces exactly the same frames. The layers keep project time on purpose -
     * they are not part of any scene (see `ProjectGlobals`), and a bed's fade or a
     * background video has to run continuously *across* a cut rather than restart
     * at every one.
     *
     * ### Why the frame before is evaluated too
     * Motion is a property of the frame rather than of the seek that reached it.
     * Differencing against wherever the playhead last sat is what would make a
     * fast scrub smear a static node, a held frame show nothing, and a backward
     * step read zero - the same frame looking different depending on how it was
     * reached. So the previous frame is *evaluated*, not remembered: put the
     * scene at `sceneTime - dt`, stamp that as the history, then evaluate the
     * frame actually being drawn and difference against it.
     *
     * Clamped at zero so the first frame primes against itself and reads
     * stationary, which is what it is. Each of the two frames is laid out before
     * its position is read, because a node's world position is `layoutBounds + x`:
     * reading the new `x` against the previous seek's rect would put the same
     * nondeterminism back in for anything an auto-layout places.
     */
    private evaluateSlot(slot: SceneSlot, localFrame: number): void {
        const sceneTime = localFrame * this.dt;
        slot.scene.attach(this.scopeAt(sceneTime));
        this.globals?.attach(this.scopeAt((slot.startFrame + localFrame) * this.dt));

        const previousTime = Math.max(0, sceneTime - this.dt);
        slot.scene.evaluateAt(previousTime);
        this.layoutScene(slot.scene);
        slot.scene.primeMotion(previousTime);

        slot.scene.evaluateAt(sceneTime);
        this.layoutScene(slot.scene);
        slot.scene.sample();

        slot.localFrame = localFrame;
    }

    /**
     * Recompute every slot's global frame range from a new per-scene duration
     * list, leaving each slot's built tree untouched.
     *
     * This is how a progressively-measured project grows: `Precomp.runAsync`
     * publishes a longer timeline as each scene lands, and the slots have to
     * follow. Deliberately *not* routed through {@link replaceScene}, which drops
     * the slot's built tree - that would throw away a build the playhead is
     * currently sitting on every time an unrelated later scene finished
     * measuring.
     *
     * Safe against the live playhead because durations only ever get *appended*:
     * a scene's `startFrame` shifts only when an **earlier** scene's duration
     * changes, and under the sequential invariant an earlier scene is already
     * final by the time the playhead can reach a later one.
     *
     * @param tracks Per-scene frame counts in timeline order.
     */
    setTracks(tracks: number[]): void {
        let offset = 0;
        for (let i = 0; i < this.slots.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots[i].startFrame = offset;
            this.slots[i].endFrame = offset + duration - 1;
            offset += duration;
        }
    }

    /**
     * Swap a single scene in place (hot reload). Disposes the old scene at
     * `index`, installs `newScene`, and recomputes every slot's global frame
     * range from `tracks` (the replaced scene's new duration shifts everything
     * downstream). Only the replaced slot is dropped - untouched slots keep the
     * trees they built, so scenes != index are never rebuilt.
     *
     * @param index     Index of the scene to replace.
     * @param newScene  The edited scene instance to install.
     * @param tracks    New per-scene frame counts in timeline order.
     */
    replaceScene(index: number, newScene: Scene, tracks: number[]): void {
        const slot = this.slots[index];
        if (!slot) return;

        const wasCurrent = this._currentScene === slot.scene;

        // Install the new scene; the old one is owned by the project config, but
        // its prior signal state is stale - dispose to free it.
        const oldScene = slot.scene;
        newScene.setViewport(this.viewport);
        this.scenes[index] = newScene;
        slot.scene = newScene;
        slot.built = false;
        slot.localFrame = -1;
        if (oldScene !== newScene) oldScene.dispose();

        // Recompute every slot's global frame range from the new track list — the
        // replaced scene's duration may have changed, shifting all later scenes.
        this.setTracks(tracks);

        // If the replaced scene was on screen, point currentScene at the new
        // instance and force a re-evaluation on the next stateAt (the slot is
        // unbuilt, so it is built and evaluated at the current local frame).
        if (wasCurrent) {
            this._currentScene = newScene;
            this._currentFrame = -1;
        }
    }

    /** Dispose all scenes and global layer frames. */
    dispose(): void {
        this.disposed = true;
        for (const slot of this.slots) {
            slot.scene.dispose();
            slot.built = false;
        }
        // Frees the per-layer frames this run built. Layer nodes supplied as live
        // instances in the config are detached rather than disposed, so the next
        // controller (StrictMode double-mount, HMR) can adopt them intact.
        this.globals?.dispose();
    }
}
