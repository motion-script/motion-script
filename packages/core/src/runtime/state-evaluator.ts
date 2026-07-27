import { RenderContext } from "@/render/render-context";
import { Size2D } from "@/attributes/layout/size";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { MeasureScope } from "@/render/measure-scope";
import { Scene } from "@/nodes/scene/scene-node";
import { now, yieldToScheduler } from "@/util/scheduler";

/**
 * Wall-clock milliseconds a time-sliced replay may run before yielding to the
 * event loop. Half a 60 Hz frame, so the other half is left for input handling
 * and paint. Much below ~4 ms and the per-yield scheduling overhead starts to
 * dominate the replay itself.
 */
export const DEFAULT_REPLAY_BUDGET_MS = 8;

/**
 * Returns `true` when the in-progress seek has been superseded and the replay
 * loop should stop. Checked between advanced frames so a slow backward seek
 * (which replays from frame 0) can be abandoned the moment a newer seek arrives.
 */
export type SeekCancel = () => boolean;

/** Per-scene generator state, kept alive so we never replay a finished scene. */
type SceneSlot = {
    scene: Scene;
    /** Absolute frame this scene starts at in the global timeline. */
    startFrame: number;
    /** Inclusive last frame for this scene (startFrame + duration - 1). */
    endFrame: number;
    generator: FrameGenerator | null;
    /** Highest frame the generator has been advanced to within this scene. */
    localFrame: number;
};

/**
 * Drives scene generators forward in time and exposes the evaluated state for
 * layout and rendering. It is the stateful playback engine that `PlaybackController`
 * calls on every tick (and on seek).
 *
 * Each scene gets a `SceneSlot` that holds its generator and the highest local
 * frame it has reached. Forward seeks simply advance the generator; backward
 * seeks within a scene reset that slot and replay from frame 0. Scenes that
 * haven't been entered yet are initialised lazily when first needed.
 *
 * Call order per frame:
 * 1. `stateAt(frame)` — advance generator(s) to the requested frame.
 * 2. `layout(scope)` — lay out the current scene's node tree.
 * 3. `render(context)` — draw the current scene into the render context.
 *
 * ### Why the replay loop lays out per frame
 * A backward seek (and any multi-frame forward jump) replays the scene
 * generator from frame 0 to the target in one `stateAt` call. Some generator
 * bodies read **post-layout** state — the animated `removeChildAt`/`reparent`
 * helpers pin a child's box to its laid-out `measuredWidth`/`measuredHeight`,
 * and the hug/fill `addChildAt` path measures against `parent._lastScope`
 * (see `node-lifecycle.ts`). Those are only fresh after a `layout()`/`measure()`
 * pass. So the replay loop lays out **before** each `generator.next(dt)`,
 * exactly as `Precomp` does — otherwise the generator would read a stale (or
 * zero, for a just-added child) `layoutRect` and the animation would diverge
 * from forward playback. This is what makes a backward scrub reproduce the
 * forward result.
 */
export class StateEvaluator {
    private scenes: Scene[];
    private slots: SceneSlot[] = [];
    private _currentFrame: number = 0;
    private fps: number;
    private viewport: Size2D;
    private assets: AssetCatalog;
    /**
     * Text-measurement scope for the internal layout passes {@link stateAt} and
     * {@link resetSlot} run between generator steps. Held here (not just passed
     * into the public {@link layout}) so the replay loop can lay out every
     * advanced frame — mirrors how {@link Precomp} keeps its own `measureScope`.
     * See the class doc for why the loop must lay out.
     */
    private measureScope: MeasureScope;
    /**
     * Resolves when the in-flight {@link stateAtAsync} finishes, or `null` when
     * none is running. Serializes async replays so two can never interleave a
     * `resetSlot` into the shared {@link stage}.
     */
    private replayInFlight: Promise<void> | null = null;
    /**
     * Set by {@link dispose}. Checked after every yield so a replay parked when
     * the evaluator was torn down (StrictMode double-mount, HMR) unwinds instead
     * of stepping generators of disposed scenes.
     */
    private disposed = false;

    /** Most-recently evaluated global frame (integer). */
    get currentFrame() {
        return this._currentFrame;
    }

    private readonly stage: BuildStage<Scene>;

    /**
     * @param scenes  Scene list in timeline order.
     * @param viewport Render viewport size; passed to each scene on init.
     * @param fps     Frames per second — used to convert frames ↔ seconds.
     * @param assets  Asset catalog bound to scenes before each generator step.
     * @param tracks  Per-scene frame counts in timeline order (one entry per
     *                scene). Used to build global frame ranges so `stateAt`
     *                can jump directly to the owning scene without scanning.
     * @param measureScope Text-measurement scope for the internal layout passes
     *                the replay loop runs between generator steps (see class doc).
     */
    constructor(scenes: Scene[], viewport: Size2D, fps: number, assets: AssetCatalog, tracks: number[], measureScope: MeasureScope) {
        this.fps = fps;
        this.viewport = viewport;
        this.scenes = scenes;
        this.assets = assets;
        this.measureScope = measureScope;
        this.stage = new BuildStage<Scene>(viewport, fps);

        for (const s of scenes) {
            s.set({ width: viewport.width, height: viewport.height });
            s.setViewport(viewport);
        }

        let offset = 0;
        for (let i = 0; i < scenes.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots.push({
                scene: scenes[i],
                startFrame: offset,
                endFrame: offset + duration - 1,
                generator: null,
                localFrame: -1,
            });
            offset += duration;
        }

        if (this.slots.length > 0) {
            this._currentScene = this.slots[0].scene;
        }
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
        // Past the last frame — return the last slot so currentScene stays valid.
        return this.slots[this.slots.length - 1] ?? null;
    }

    /**
     * Resets a single scene slot and primes its generator up to local frame 0.
     * Scenes that come *after* this one in the timeline are left untouched —
     * they will be lazily initialised when first needed.
     */
    private resetSlot(slot: SceneSlot): void {
        slot.scene.reset();
        slot.scene.bindAssets(this.assets);
        slot.scene.bindContext(ContextMap.EMPTY, true);
        slot.scene.ellapse(0);
        this.stage.reset();
        const gen = slot.scene.build(this.stage);
        // Prime: advance to the first yield so frame-0 nodes are registered.
        gen.next(this.dt);
        // ellapse(0) above ran before build() created the frame-0 nodes, so seed
        // their sampling history now (zero velocity) — a forward step from here
        // then differentiates against a real previous frame.
        slot.scene.sample();
        // Lay out the primed frame-0 tree so the first advance-loop step (which
        // runs the generator from frame 0 → 1) reads a real `layoutRect` — a
        // frame-0 animated removeChildAt pins to `measuredWidth`, which is 0
        // until this pass. Precomp lays out at the top of its loop before the
        // first `generator.next`; this gives the reset path the same guarantee.
        this.layoutScene(slot.scene);
        slot.generator = gen;
        slot.localFrame = 0;
    }

    /**
     * Lay out a scene's node tree against the full viewport with the retained
     * measure scope. Shared by the public {@link layout} (render pass) and the
     * per-frame layout the replay loop / {@link resetSlot} run so generator
     * bodies read a fresh `layoutRect` (see class doc).
     */
    private layoutScene(scene: Scene): void {
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        scene.layout(bounds, this.measureScope);
    }

    /** Lay out the current scene's node tree against the full viewport. */
    layout(scope: MeasureScope = this.measureScope) {
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        this.currentScene.layout(bounds, scope);
    }

    /** Render the current scene's node tree into `context`. */
    render(context: RenderContext) {
        this.currentScene.render(context);
    }

    /**
     * Advance (or rewind) state to the given global `frame`.
     *
     * - If `frame` matches the current frame and the generator is already
     *   primed, this is a no-op (early return).
     * - If the target is within the current slot but behind the generator's
     *   position, the slot is reset and replayed from frame 0.
     * - If the target belongs to a different scene, that slot is entered
     *   (resetting it if necessary) and advanced to the local target frame.
     *
     * If `isCancelled` returns true mid-replay, the loop bails *without*
     * advancing `_currentFrame`, leaving the slot at a partial local frame. The
     * partial work is intentionally discarded: a later backward seek resets and
     * replays cleanly, and a later forward seek simply resumes advancing from the
     * partial frame (the generator is mid-scene but internally consistent). Since
     * `_currentFrame` is untouched, the early-return guard below won't mistake the
     * partial position for a completed seek.
     *
     * @param frame Global frame index (float accepted; fractional part ignored).
     * @param isCancelled Optional predicate polled between advanced frames; when it
     *                    returns true the replay stops early (see above).
     */
    stateAt(frame: number, isCancelled?: SeekCancel): void {
        const plan = this.beginReplay(frame);
        if (!plan) return;
        const { slot, localTarget, clampedFrame } = plan;
        const dt = this.dt;

        while (slot.localFrame < localTarget) {
            // A newer seek superseded this one — abandon the replay. We leave
            // _currentFrame untouched (the slot is at a partial localFrame); the
            // next stateAt resets or resumes from there cleanly.
            if (isCancelled?.()) return;
            this.stepReplay(slot, dt);
        }

        this._currentFrame = clampedFrame;
    }

    /**
     * Time-sliced twin of {@link stateAt}: identical per-frame semantics (both
     * drive {@link stepReplay}), but the loop yields to the event loop every
     * `budgetMs` so a newer seek can actually preempt one already running.
     *
     * This is the whole point of the async path. `stateAt` is synchronous, so
     * while it runs no other JS can execute — nothing can bump the caller's
     * generation counter, so its `isCancelled` predicate is *provably* always
     * false. A backward seek deep into a long scene therefore blocks the main
     * thread for its full duration and cannot be abandoned. Yielding is what
     * makes cancellation observable.
     *
     * ### Re-entrancy
     * The only suspension point is the `await` below, so another replay can only
     * begin there. `isCancelled` is re-checked as the *first* thing after every
     * resume, before touching `slot` — so a superseded replay can never mutate
     * state a newer one has already moved on from. On top of that, concurrent
     * async replays are serialized through {@link replayInFlight}, because
     * `resetSlot` rebuilds into the shared `stage` and two interleaved resets
     * would corrupt it.
     *
     * The synchronous {@link stateAt} is deliberately *not* gated by
     * `replayInFlight`: it never suspends, so it always completes atomically
     * with respect to an async replay parked on a yield — and that replay
     * re-validates everything on resume.
     *
     * @returns `true` if `frame` was reached, `false` if the replay was
     *          superseded, cancelled, or the evaluator was disposed. A `false`
     *          return means `_currentFrame` is untouched and the caller must not
     *          render.
     */
    async stateAtAsync(
        frame: number,
        isCancelled?: SeekCancel,
        budgetMs: number = DEFAULT_REPLAY_BUDGET_MS,
    ): Promise<boolean> {
        // Wait out any replay already in flight. A `while`, not an `if`, so more
        // than two queued seeks unwind correctly; and because every waiter
        // re-checks `isCancelled` on wake, only the newest survives the queue.
        while (this.replayInFlight) await this.replayInFlight;
        if (this.disposed || isCancelled?.()) return false;

        let release!: () => void;
        this.replayInFlight = new Promise<void>(resolve => { release = resolve; });
        try {
            // `beginReplay` may `resetSlot`, which is indivisible and expensive
            // (a full tree teardown + rebuild + layout). Yield first so the
            // previous slice's paint lands before we occupy the thread with it.
            await yieldToScheduler();
            if (this.disposed || isCancelled?.()) return false;

            const plan = this.beginReplay(frame);
            if (!plan) return !this.disposed;
            const { slot, localTarget, clampedFrame } = plan;
            const dt = this.dt;

            let deadline = now() + budgetMs;
            while (slot.localFrame < localTarget) {
                if (isCancelled?.()) return false;
                if (now() >= deadline) {
                    await yieldToScheduler();
                    // Everything below must be re-validated before we mutate:
                    // arbitrary code ran while we were parked.
                    if (this.disposed || isCancelled?.()) return false;
                    // A concurrent replaceScene can null the generator out from
                    // under us; resuming into it would throw.
                    if (!slot.generator) return false;
                    deadline = now() + budgetMs;
                }
                this.stepReplay(slot, dt);
            }

            this._currentFrame = clampedFrame;
            return true;
        } finally {
            this.replayInFlight = null;
            release();
        }
    }

    /**
     * Resolve a replay target: pick the owning slot, make it current, and reset it
     * if the target is behind where its generator already stands (or it was never
     * primed). Returns `null` when there is nothing to do — the frame is already
     * evaluated, or there are no slots.
     *
     * Shared by {@link stateAt} and {@link stateAtAsync} so both agree on when a
     * slot is reset. Synchronous and indivisible: `resetSlot` tears the scene's
     * whole node tree down and rebuilds it, so it must not be interleaved with
     * another replay.
     */
    private beginReplay(
        frame: number,
    ): { slot: SceneSlot; localTarget: number; clampedFrame: number } | null {
        const clampedFrame = Math.max(0, Math.floor(frame));

        if (clampedFrame === this._currentFrame && this.slotAt(clampedFrame)?.generator !== null) return null;

        const targetSlot = this.slotAt(clampedFrame);
        if (!targetSlot) return null;

        this._currentScene = targetSlot.scene;

        const localTarget = clampedFrame - targetSlot.startFrame;

        // If we need to go backwards within this slot, reset only this slot.
        if (targetSlot.generator === null || targetSlot.localFrame > localTarget) {
            this.resetSlot(targetSlot);
        }

        return { slot: targetSlot, localTarget, clampedFrame };
    }

    /**
     * Advance `slot` by exactly one local frame.
     *
     * The load-bearing part of the replay lives here and **only** here, so the
     * synchronous {@link stateAt} and the time-sliced {@link stateAtAsync} can
     * never drift apart in per-frame ordering or semantics.
     *
     * `ellapse()` both ticks and samples motion for the frame (see `Node.ellapse`),
     * so running it on every advanced frame — not just rendered ones — keeps
     * velocity-derived effects (motion blur) correct after a scrub/rewind.
     */
    private stepReplay(slot: SceneSlot, dt: number): void {
        slot.localFrame++;
        const globalTime = (slot.startFrame + slot.localFrame) * dt;
        // Scoped to the slot being advanced — the same three calls, on the same
        // scene, in the same order as `Precomp.precompScene`'s loop (and as
        // `resetSlot` above). Fanning them out across every scene would be pure
        // waste (nothing mutates a frozen scene's tree during this replay) and
        // actively wrong: `advanceClock` seeds `creation` on first touch and scene
        // roots outlive `reset()`, so ellapsing an un-entered scene at *global*
        // time births its root mid-timeline, and a later seek into it then reports
        // a negative `elapsed` for the rest of the session.
        slot.scene.bindAssets(this.assets);
        // Structural re-push only (runInit=false): refresh context on any subtree
        // added this frame without re-firing init mid-tween.
        slot.scene.bindContext(ContextMap.EMPTY, false);
        slot.scene.ellapse(globalTime);
        // Lay out before stepping the generator so any post-layout state it
        // reads (an animated removeChildAt pinning to `measuredWidth`, the
        // hug/fill addChildAt measuring against `_lastScope`) is fresh for
        // this frame — the ordering precomp uses. Without this the replay
        // (backward seek / multi-frame jump) reads a stale layoutRect and
        // the animation diverges from forward playback (see class doc).
        this.layoutScene(slot.scene);
        // Read `slot.generator` fresh — never hoist it into a local across a yield.
        // A synchronous stateAt (from a clock tick) can run resetSlot while an async
        // replay is parked, replacing the generator this slot points at.
        slot.generator!.next(dt);
    }

    /**
     * Swap a single scene in place (hot reload). Disposes the old scene at
     * `index`, installs `newScene`, and recomputes every slot's global frame
     * range from `tracks` (the replaced scene's new duration shifts everything
     * downstream). Only the replaced slot's generator is dropped — untouched
     * slots keep their cached generators, so scenes ≠ index never re-run.
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
        // its prior signals/generator state are stale — dispose to free them.
        const oldScene = slot.scene;
        newScene.set({ width: this.viewport.width, height: this.viewport.height });
        newScene.setViewport(this.viewport);
        this.scenes[index] = newScene;
        slot.scene = newScene;
        slot.generator = null;
        slot.localFrame = -1;
        if (oldScene !== newScene) oldScene.dispose();

        // Recompute every slot's global frame range from the new track list — the
        // replaced scene's duration may have changed, shifting all later scenes.
        let offset = 0;
        for (let i = 0; i < this.slots.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots[i].startFrame = offset;
            this.slots[i].endFrame = offset + duration - 1;
            offset += duration;
        }

        // If the replaced scene was on screen, point currentScene at the new
        // instance and force a re-evaluation on the next stateAt (its generator
        // is null, so the slot is reset and replayed to the current local frame).
        if (wasCurrent) {
            this._currentScene = newScene;
            this._currentFrame = -1;
        }
    }

    /** Dispose all scenes and drop generator references. */
    dispose(): void {
        this.disposed = true;
        for (const slot of this.slots) {
            slot.scene.dispose();
            slot.generator = null;
        }
    }
}
