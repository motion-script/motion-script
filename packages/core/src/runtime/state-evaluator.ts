import { RenderContext } from "@/render/render-context";
import { Size2D } from "@/attributes/layout/size";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { Measurer } from "@/render/measurer";
import { Scene } from "@/nodes/scene/scene-node";
import { ProjectGlobals } from "./globals";
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
    /** Position of this slot in the timeline; the scene index global layers filter on. */
    index: number;
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
    private measureScope: Measurer;
    /**
     * The project's background/overlay layers, drawn around every scene. Not part
     * of any scene tree — see {@link ProjectGlobals} — so the evaluator drives
     * them itself, selecting the ones that apply as it enters each scene.
     */
    private readonly globals?: ProjectGlobals;
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
        measureScope: Measurer,
        globals?: ProjectGlobals,
    ) {
        this.fps = fps;
        this.viewport = viewport;
        this.scenes = scenes;
        this.assets = assets;
        this.measureScope = measureScope;
        this.globals = globals;
        this.stage = new BuildStage<Scene>(viewport, fps);

        for (const s of scenes) {
            s.set({ width: viewport.width, height: viewport.height });
            s.setViewport(viewport);
        }
        globals?.setViewport(viewport);

        let offset = 0;
        for (let i = 0; i < scenes.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots.push({
                scene: scenes[i],
                index: i,
                startFrame: offset,
                endFrame: offset + duration - 1,
                generator: null,
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
        globals.bindAssets(this.assets);
        globals.bindContext(ContextMap.EMPTY);
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
        // of those would make `beginReplay` reset and drive a scene the precomp
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
        // Layers run on the project clock, so a slot primed at its scene's local
        // frame 0 still puts them at that scene's *global* start — a bed's fade or
        // a background video is continuous across the cut rather than restarting.
        this.globals?.ellapse(slot.startFrame * this.dt);
        this.globals?.sample();
        this.layoutGlobals();
        slot.generator = gen;
        slot.localFrame = 0;
    }

    /** Lay the active global layers out against the full viewport. */
    private layoutGlobals(scope: Measurer = this.measureScope): void {
        if (!this.globals) return;
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        this.globals.layout(bounds, scope);
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

    /** Lay out the current scene's node tree — and the active global layers — against the full viewport. */
    layout(scope: Measurer = this.measureScope) {
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
    render(context: RenderContext) {
        this.globals?.backgrounds.render(context);
        this.currentScene.render(context);
        this.globals?.overlays.render(context);
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

        // A driven scene knows its own state at a time, so there is nothing to
        // replay: no walk from the last position, no reset when the target is
        // behind it, and the cost is the same whichever direction the playhead
        // moved. See `createDrivenScene`.
        if (this.evaluateSlot(slot, localTarget)) {
            this._currentFrame = clampedFrame;
            return;
        }

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
     * Put a driven slot into the state for `localFrame`, or report that it has no
     * driver and must be replayed.
     *
     * The per-frame preamble is the same as {@link stepReplay}'s — the catalog,
     * the context re-push, and the two clocks — because everything below the
     * driver is unchanged. Only the last line differs: the generator is stepped
     * one frame, the driver is asked for a time.
     */
    private evaluateSlot(slot: SceneSlot, localFrame: number): boolean {
        if (!isDriven(slot.scene)) return false;

        const sceneTime = localFrame * this.dt;
        slot.scene.bindAssets(this.assets);
        slot.scene.bindContext(ContextMap.EMPTY, false);
        slot.scene.ellapse(sceneTime);
        this.globals?.ellapse((slot.startFrame + localFrame) * this.dt);

        // Motion, made a property of the frame rather than of the seek that got
        // here. A generator scene walks time forward one `dt` at a time, so its
        // backward difference is already against the frame before; a driven one
        // jumps straight to the target, so differencing against wherever the
        // playhead last sat is what makes a fast scrub smear a static node, a
        // held frame show nothing, and a backward step read zero — the same
        // frame looking different depending on how it was reached.
        //
        // So the previous frame is *evaluated*, not remembered: put the scene at
        // `sceneTime - dt`, stamp that as the history, then evaluate the frame
        // actually being drawn and difference against it. Two extra driver
        // evaluations, on the path that skips the replay loop entirely.
        //
        // Clamped at zero so the first frame primes against itself and reads
        // stationary, which is what it is — there is no frame before it.
        // Each of the two frames is laid out before its position is read, because
        // a node's world position is `layoutRect + x`: reading the new `x`
        // against the previous seek's rect would put the same nondeterminism
        // back in for anything an auto-layout places.
        const previousTime = Math.max(0, sceneTime - this.dt);
        slot.scene.evaluateAt(previousTime);
        this.layoutScene(slot.scene);
        slot.scene.primeMotion(previousTime);

        // Layout runs after the evaluation, not before: a generator body reads
        // `layoutRect` as it steps, so the replay must lay out first — a driver
        // writes props and reads nothing, so the layout that matters is the one
        // against the values just written.
        slot.scene.evaluateAt(sceneTime);
        this.layoutScene(slot.scene);
        slot.scene.sample();

        slot.localFrame = localFrame;
        return true;
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

            // Nothing to time-slice for a driven scene: this whole apparatus —
            // the budget, the yields, the re-validation after each one — exists
            // because a replay's length is unbounded, and an evaluation's is one
            // call. Cancellation has nothing to cancel.
            if (this.evaluateSlot(slot, localTarget)) {
                this._currentFrame = clampedFrame;
                return true;
            }

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
     * Force the next {@link stateAt} to actually re-evaluate the current frame,
     * by rewinding the owning slot and dropping the memo that makes a repeat call
     * a no-op.
     *
     * Needed by `PlaybackController.clearNodeOverrides`: a transient override is
     * written straight onto a live signal, so the only way back to the
     * scene-authored value is to let the generator author it again. That means a
     * genuine replay from the slot's frame 0 — {@link beginReplay}'s early return
     * would otherwise leave the overridden value on screen, and clearing
     * `_currentFrame` alone would not rewind the generator far enough to rewrite
     * anything.
     *
     * A no-op before the first evaluation. `@internal`.
     */
    /** @internal */
    invalidate(): void {
        if (this._currentFrame < 0) return;
        const slot = this.slotAt(this._currentFrame);
        if (!slot) return;
        this.resetSlot(slot);
        this._currentFrame = -1;
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
        // Before any reset/step below, so the layers a `resetSlot` primes and
        // lays out are already the ones this scene includes.
        this.selectGlobals(targetSlot.index);

        const localTarget = clampedFrame - targetSlot.startFrame;

        // A slot that has never been entered has to be built, driven or not:
        // `resetSlot` is what constructs the tree, and for a driven scene it is
        // also what compiles the timelines.
        //
        // Going *backwards* is the difference. A generator can only be advanced,
        // so reaching an earlier frame means throwing the tree away and replaying
        // from zero — which is what made a backward scrub cost more the further
        // into a scene it happened. A driver is asked for a time, so there is
        // nothing to rewind: resetting here would dispose and rebuild a tree only
        // to ask it the same question, and would put the cost back exactly where
        // driving the scene was meant to take it from.
        const driven = isDriven(targetSlot.scene);
        if (targetSlot.generator === null || (!driven && targetSlot.localFrame > localTarget)) {
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
     *
     * ### Two clocks, deliberately
     * The scene runs on **scene time** and the global layers on **project time**.
     * That split is what makes a scene independent of where it sits: rendered on
     * its own, or third in a timeline, it is handed exactly the same clock and so
     * produces exactly the same frames. It is also what `NodeClock.time`
     * ("absolute time since the scene started") has always documented, what
     * `Precomp.precompSceneSteps` measures with, and what the scene-relative
     * `audioRequests` precomp records are expressed in — so anything but scene
     * time here puts playback out of step with its own measurement.
     *
     * The layers keep project time on purpose: they are not part of any scene
     * (see `ProjectGlobals`), and a bed's fade or a background video has to run
     * continuously *across* a cut rather than restart at every one.
     */
    private stepReplay(slot: SceneSlot, dt: number): void {
        slot.localFrame++;
        const sceneTime = slot.localFrame * dt;
        const projectTime = (slot.startFrame + slot.localFrame) * dt;
        // Scoped to the slot being advanced — the same three calls, on the same
        // scene, in the same order as `Precomp.precompScene`'s loop (and as
        // `resetSlot` above). Fanning them out across every scene would be pure
        // waste (nothing mutates a frozen scene's tree during this replay) and
        // actively wrong: `advanceClock` seeds `creation` on first touch and scene
        // roots outlive `reset()`, so ellapsing an un-entered scene at a time its
        // own clock has not reached births its root mid-scene, and a later seek
        // into it then reports a negative `elapsed` for the rest of the session.
        slot.scene.bindAssets(this.assets);
        // Structural re-push only (runInit=false): refresh context on any subtree
        // added this frame without re-firing init mid-tween.
        slot.scene.bindContext(ContextMap.EMPTY, false);
        slot.scene.ellapse(sceneTime);
        // Layers advance on the project clock, so they neither restart nor jump
        // at a scene cut.
        this.globals?.ellapse(projectTime);
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
     * Recompute every slot's global frame range from a new per-scene duration
     * list, leaving generators and replay progress untouched.
     *
     * This is how a progressively-measured project grows: `Precomp.runAsync`
     * publishes a longer timeline as each scene lands, and the slots have to
     * follow. Deliberately *not* routed through {@link replaceScene}, which nulls
     * the slot's generator — that would throw away a replay the playhead is
     * currently sitting on and force a full re-drive from the scene's frame 0
     * every time an unrelated later scene finished measuring.
     *
     * Safe against the live playhead because durations only ever get *appended*:
     * a scene's `startFrame` shifts only when an **earlier** scene's duration
     * changes, and under the sequential invariant an earlier scene is already
     * final by the time the playhead can reach a later one. So `stepReplay`'s
     * `globalTime` never jumps for the slot being replayed.
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
        this.setTracks(tracks);

        // If the replaced scene was on screen, point currentScene at the new
        // instance and force a re-evaluation on the next stateAt (its generator
        // is null, so the slot is reset and replayed to the current local frame).
        if (wasCurrent) {
            this._currentScene = newScene;
            this._currentFrame = -1;
        }
    }

    /** Dispose all scenes and global layer frames, and drop generator references. */
    dispose(): void {
        this.disposed = true;
        for (const slot of this.slots) {
            slot.scene.dispose();
            slot.generator = null;
        }
        // Frees the per-layer frames this run built. Layer nodes supplied as live
        // instances in the config are detached rather than disposed, so the next
        // controller (StrictMode double-mount, HMR) can adopt them intact.
        this.globals?.dispose();
    }
}

/**
 * Whether `scene` can be asked for a time rather than run to one.
 *
 * Tested by whether it can say how long it is: a scene is only drivable if it
 * declared a duration, and anything else — a generator scene's `null`, a
 * stand-in that never implemented this — belongs on the replay path.
 */
function isDriven(scene: Scene): boolean {
    const duration = scene.drivenDuration;
    return typeof duration === "number" && Number.isFinite(duration);
}
