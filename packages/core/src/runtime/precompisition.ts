import { AudioRequest } from "@/attributes/audio/request";
import { BuildStage } from "@/render/build-stage";
import { Measurer } from "../render/measurer";
import { AssetRecord } from "@/assets/record";
import { Node } from "@/nodes/base/node";
import { nodePath } from "@/project/tree";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { Size2D } from "@/attributes/layout/size";
import { AssetTracker } from "@/assets/tracker";
import { Scene } from "@/nodes/scene/scene-node";
import { ProjectGlobals, resolveGlobalAudio } from "./globals";
import { now, yieldToScheduler } from "@/util/scheduler";

// ─── Asset track types ────────────────────────────────────────────────────────

/**
 * A single asset's position on the global frame timeline together with the
 * load/evict windows the asset manager uses to keep memory bounded.
 */
export interface AssetTrack {
    record: AssetRecord;
    /**
     * Frame at which loading should begin. Always <= startFrame.
     * Derived from decoded memory footprint: larger assets get earlier lead time.
     */
    cacheAt: number;
    /**
     * Frame at which the asset may be evicted under memory pressure, or null
     * if it should never be evicted (e.g. fonts). Always >= endFrame when set.
     */
    discardAt: number | null;
}



// ─── Per-scene precomp output ─────────────────────────────────────────────────

export interface BuildError {
    /** Name of the scene that threw. */
    sceneName: string;
    /** Zero-based index of the scene in the scenes array. */
    sceneIndex: number;
    message: string;
    stack?: string;
}

/** Scene-local lifespan (inclusive frame range) a node is alive for. */
export interface NodeLifespan {
    /** First scene-local frame the node was present in the tree. */
    startFrame: number;
    /** Last scene-local frame the node was present in the tree. */
    endFrame: number;
}

/**
 * Everything learned from running one scene's generator to completion, in
 * **scene-local** terms (frame 0 = the scene's first frame).
 *
 * Scenes are independent units — they no longer compose — so each scene's pass
 * is fully self-contained: its frame count, its own asset usage, its audio, and
 * its node lifespans are all scene-local. The only place a scene's global
 * position enters is `startFrame`, recomputed cheaply when an upstream scene's
 * duration changes (see {@link assembleTimeline}). This is what makes a single
 * scene re-runnable in isolation for hot reloading.
 */
export interface ScenePrecomp {
    /**
     * Whether this scene's generator has actually been driven yet.
     *
     * `Precomp.runAsync` publishes intermediate results in which scenes it hasn't
     * reached appear as zero-length placeholders, so downstream frame arithmetic
     * stays valid while the timeline is still growing. This flag is the only way
     * to tell such a placeholder from a scene that genuinely measured zero
     * frames — don't infer it from `frameCount`.
     */
    measured: boolean;
    /** Frame count for this scene. */
    frameCount: number;
    /** Absolute frame offset of this scene in the global timeline. */
    startFrame: number;
    /** Audio requests emitted by this scene's nodes, with scene-relative timing. */
    audioRequests: AudioRequest[];
    /**
     * This scene's own asset usage, in **scene-local** frames (records carry
     * `startFrame`/`endFrame` relative to the scene). Merged and shifted into the
     * global asset map by {@link assembleTimeline}. Keyed by stable asset key
     * (src for images/videos, family for fonts).
     */
    assetRecords: ReadonlyMap<string, AssetRecord>;
    /**
     * Per-node lifespan within this scene, in scene-local frames. Keyed by the
     * node's structural path (child-index path from the scene root, e.g.
     * "0.2.1") rather than its id: ids are per-instance UUIDs that change when a
     * scene is rebuilt, but the build is deterministic so the structural path is
     * stable between the precomp pass and playback. A node added or removed
     * partway through a scene gets a range narrower than the scene's duration.
     */
    lifespans: Map<string, NodeLifespan>;
}

// ─── Profiling ────────────────────────────────────────────────────────────────

/**
 * The distinct pieces of work {@link Precomp.precompSceneSteps}'s per-frame loop
 * performs. Each is a full walk of the scene's node tree (except `generator`,
 * which is the author's own tween code), so attributing wall-clock to them is
 * what tells you which one to optimize.
 */
export type PrecompPhase =
    | "prepareLayout"
    | "layout"
    | "prepareRender"
    | "lifespans"
    | "bindAssets"
    | "bindContext"
    | "ellapse"
    | "generator";

const PRECOMP_PHASES: readonly PrecompPhase[] = [
    "prepareLayout", "layout", "prepareRender",
    "lifespans", "bindAssets", "bindContext", "ellapse", "generator",
];

/** Wall-clock breakdown of one scene's build pass, in milliseconds. */
export interface ScenePrecompTiming {
    sceneName: string;
    sceneIndex: number;
    frameCount: number;
    /** Total ms spent inside the pass, excluding time parked on a yield. */
    totalMs: number;
    /** Ms attributed to each phase of the per-frame loop. */
    phases: Record<PrecompPhase, number>;
}

/** Per-scene timings, in timeline order. Sparse until every scene has run. */
export type PrecompTimings = (ScenePrecompTiming | undefined)[];

/**
 * Timing sink for a single scene's pass.
 *
 * `enter` closes whichever phase was open and starts the named one, so the loop
 * pays exactly one call per phase. `suspend`/`resume` bracket a yield so parked
 * time isn't billed to whatever phase happened to be open.
 */
export interface ScenePrecompProfile {
    enter(phase: PrecompPhase): void;
    suspend(): void;
    resume(): void;
    done(frameCount: number): void;
}

/**
 * Optional profiler injected into {@link Precomp}. Deliberately a seam rather
 * than a module global: it keeps `core` free of any environment assumption, and
 * leaves nothing but a never-taken branch in a production bundle.
 */
export interface PrecompProfile {
    scene(sceneIndex: number, sceneName: string): ScenePrecompProfile;
}

/**
 * A {@link PrecompProfile} that accumulates into a {@link PrecompTimings} array.
 * Pass `profile` to `new Precomp(...)` and read `PrecompResult.timings`.
 */
export function createPrecompProfile(): PrecompProfile & { timings: PrecompTimings } {
    const timings: PrecompTimings = [];
    return {
        timings,
        scene(sceneIndex: number, sceneName: string): ScenePrecompProfile {
            const phases = Object.fromEntries(
                PRECOMP_PHASES.map(p => [p, 0]),
            ) as Record<PrecompPhase, number>;
            let open: PrecompPhase | null = null;
            let since = now();
            let totalMs = 0;
            const close = () => {
                const elapsed = now() - since;
                if (open) phases[open] += elapsed;
                totalMs += elapsed;
            };
            return {
                enter(phase) {
                    close();
                    open = phase;
                    since = now();
                },
                suspend() {
                    close();
                    open = null;
                },
                resume() {
                    since = now();
                },
                done(frameCount) {
                    close();
                    open = null;
                    timings[sceneIndex] = { sceneName, sceneIndex, frameCount, totalMs, phases };
                },
            };
        },
    };
}

// ─── Full precomp result ──────────────────────────────────────────────────────

export interface PrecompResult {
    fps: number;
    /** Per-scene durations and audio, in timeline order. */
    scenes: ScenePrecomp[];
    /**
     * Project-level audio beds (`ProjectConfig.audioTracks`), resolved against
     * the project total. Unlike {@link ScenePrecomp.audioRequests} these carry
     * **absolute** timeline times — consumers schedule them with a zero scene
     * offset. Re-derived on every assembly, so a bed bounded against a partial
     * total while the background precomp runs is corrected as scenes land.
     */
    globalAudio: AudioRequest[];
    /** Total frame count across all scenes. */
    totalFrames: number;
    /** Total duration in seconds. */
    totalDuration: number;
    /**
     * Complete asset timeline assembled by merging every scene's own asset usage,
     * each shifted by that scene's global startFrame. Keyed by stable asset key
     * (src for images/videos, "Family" for fonts).
     */
    assets: ReadonlyMap<string, AssetTrack>;
    /** Errors thrown by scene generators during the build pass. */
    buildErrors: BuildError[];
    /**
     * True once every scene has been measured. False for the intermediate
     * results {@link Precomp.runAsync} publishes while it is still working, where
     * `totalFrames`/`totalDuration` cover only the scenes measured so far and
     * will grow. UI that shows a timeline length should say so while this is
     * false rather than presenting a partial total as final.
     */
    complete: boolean;
    /**
     * Per-phase wall-clock breakdown, present only when a {@link PrecompProfile}
     * was injected. Diagnostics — nothing in the engine reads this.
     */
    timings?: PrecompTimings;
}

// ─── Precomp runner ───────────────────────────────────────────────────────────

/** What one scene's build pass produces: its precomp, plus any error it threw. */
interface ScenePassOutcome {
    precomp: ScenePrecomp;
    error?: BuildError;
}

/**
 * A host-provided store of previously-measured scene passes, letting an unchanged
 * scene skip its build pass entirely.
 *
 * The host owns both storage and **validity**: entries handed to {@link get} are
 * assumed to already have been checked against whatever the pass depended on
 * (scene source and its imports, project config, referenced assets, engine
 * version). `Precomp` cannot make that judgement — it has no idea what a scene's
 * source looks like — so it trusts what it is given and simply records fresh
 * passes back via {@link put}.
 *
 * See `@motion-script/vite-plugin`, which implements this over a project-local
 * `.motion-script/precomp.json` and validates by re-hashing each entry's recorded
 * source dependencies.
 */
export interface PrecompCache {
    /** A previously-stored pass for `sceneKey`, already validated, or undefined. */
    get(sceneKey: string): ScenePrecomp | undefined;
    /** Record a freshly-measured pass. Only called for scenes that built cleanly. */
    put(sceneKey: string, precomp: ScenePrecomp): void;
}

/** Options controlling how a {@link Precomp} runs. */
export interface PrecompOptions {
    /** Optional timing sink; see {@link createPrecompProfile}. */
    profile?: PrecompProfile;
    /** Optional store of previously-measured passes; see {@link PrecompCache}. */
    cache?: PrecompCache;
    /**
     * The project's global audio beds and background/overlay layers. The **same
     * instance** must be handed to the {@link StateEvaluator} that plays the
     * project back (read it off {@link Precomp.globals}), so the layers this
     * pass measures assets for are the ones that actually draw.
     */
    globals?: ProjectGlobals;
    /**
     * Whether to record per-node lifespans. Defaults to true.
     *
     * {@link recordLifespans} walks the whole node tree and allocates a path
     * string per node on **every frame**, and the only consumer is an editor
     * timeline drawing each node's bar. A render that just wants frame counts
     * and asset windows — an export, a screenshot — pays that for nothing, so it
     * can turn the walk off.
     *
     * A pass measured with this off is deliberately **never offered to the host
     * {@link PrecompCache}**: its `lifespans` map is empty, and an editor that
     * later read that entry would show a timeline with no bars and no way to
     * tell it apart from a genuinely empty measurement.
     */
    lifespans?: boolean;
}

/** Knobs for {@link Precomp.runAsync}. */
export interface RunAsyncOptions {
    /**
     * Wall-clock ms the pass may occupy before yielding to the event loop.
     * Defaults to {@link DEFAULT_PRECOMP_BUDGET_MS}. Set to `0` in tests to force
     * a yield on every frame, making preemption deterministic.
     */
    budgetMs?: number;
    /** Polled after every yield; when it returns true the pass abandons its work. */
    isCancelled?: () => boolean;
    /**
     * Called with a freshly assembled result each time a scene finishes, so a
     * consumer can publish a growing timeline instead of waiting for the whole
     * project. The final call has `complete: true`.
     */
    onProgress?: (result: PrecompResult) => void;
}

/**
 * Wall-clock ms a background precomp may run before yielding. Matches
 * `DEFAULT_REPLAY_BUDGET_MS` — half a 60 Hz frame, leaving the other half for
 * input handling and paint.
 */
export const DEFAULT_PRECOMP_BUDGET_MS = 8;

/**
 * Runs offline build passes over a project's scenes before/while it plays.
 *
 * Each scene is driven through its generator (without rendering) to learn its
 * frame count, asset usage, audio, and per-node lifespans — all scene-local.
 * {@link ensureScene} is the unit of work and memoizes, so every entry point
 * below is a different scheduling policy over the same passes:
 *
 * - {@link run} — every scene, synchronously. Blocks until the whole project is
 *   measured; used by callers that have nothing to show until then.
 * - {@link runAsync} — every scene, time-sliced, publishing a growing result as
 *   each one lands. This is the interactive path: the player renders frame 0
 *   after scene 0 rather than after scene *n*.
 * - {@link runUntil} — stops as soon as a caller has what it needs (a screenshot
 *   at frame *f* only needs the scenes up to the one owning *f*).
 * - {@link replaceScene} — re-runs one scene and reuses every other scene's
 *   cached pass, which is what makes scene-level hot reloading cheap.
 *
 * ### The sequential invariant
 *
 * Scenes must be measured **in order, starting from 0**, and a scene must be
 * fully measured before anything else drives its generator. `Precomp` and
 * `StateEvaluator` share the same `Scene` instances and {@link precompSceneSteps}
 * calls `scene.reset()`, which would tear down a tree the evaluator is live on.
 * Ordering is what keeps them apart: a frame inside scene *k* is not addressable
 * until scenes `0..k-1` have durations, so the evaluator cannot reach a scene
 * the background pass has not already finished with.
 *
 * `run`/`runAsync`/`replaceScene` each return a fresh immutable
 * {@link PrecompResult} the `PlaybackController` swaps in; the per-scene passes
 * behind them are cached on the instance.
 */
export class Precomp {
    private scenes: Scene[];
    private readonly viewport: Size2D;
    private readonly fps: number;
    private readonly assets: AssetCatalog;
    private readonly measureScope: Measurer;
    private readonly profile?: PrecompProfile;
    /** Host-provided store of previously-measured passes; see {@link PrecompCache}. */
    private readonly store?: PrecompCache;
    /** The project's global audio + layers; see {@link PrecompOptions.globals}. */
    private readonly _globals?: ProjectGlobals;
    /** Whether to run the per-frame lifespan walk; see {@link PrecompOptions.lifespans}. */
    private readonly trackLifespans: boolean;
    /** Memoized per-scene passes, indexed by scene. Invalidated by {@link replaceScene}. */
    private readonly cache: (ScenePrecomp | undefined)[] = [];
    /** Build error from each scene's cached pass, parallel to {@link cache}. */
    private readonly cachedErrors: (BuildError | undefined)[] = [];

    constructor(
        scenes: Scene[],
        viewport: Size2D,
        fps: number,
        assets: AssetCatalog,
        measureScope: Measurer,
        options: PrecompOptions = {},
    ) {
        this.scenes = scenes;
        this.viewport = viewport;
        this.fps = fps;
        this.assets = assets;
        this.measureScope = measureScope;
        this.profile = options.profile;
        this.store = options.cache;
        this._globals = options.globals;
        this.trackLifespans = options.lifespans ?? true;
        this._globals?.setViewport(viewport);
    }

    /** The scene list this precomp drives (kept in sync by {@link replaceScene}). */
    get sceneList(): readonly Scene[] {
        return this.scenes;
    }

    /**
     * The project's global audio + layers, or `undefined` when none were
     * supplied. Hand this to the {@link StateEvaluator} so playback draws the
     * same layer instances this pass measured.
     */
    get globals(): ProjectGlobals | undefined {
        return this._globals;
    }

    /** How many scenes have been measured so far. */
    get measuredCount(): number {
        let n = 0;
        for (let i = 0; i < this.scenes.length; i++) if (this.cache[i]) n++;
        return n;
    }

    /**
     * Measure scene `index` if it hasn't been already, and return its pass.
     *
     * The one place a scene's generator is actually driven, and idempotent: a
     * second call is a cache read. Every other entry point is a policy for
     * choosing *when* to call this.
     */
    ensureScene(index: number): ScenePrecomp {
        return this.measureScene(index, "any");
    }

    /**
     * @param lookup Which kind of host {@link PrecompCache} key may stand in for a
     *               real pass. `"any"` on the normal path. `"content-only"` on the
     *               replace path — see {@link StoreLookup}.
     */
    private measureScene(index: number, lookup: StoreLookup): ScenePrecomp {
        const hit = this.cache[index];
        if (hit) return hit;

        const scene = this.scenes[index];
        const key = lookup === "any" ? storeKeyOf(scene) : contentKeyOf(scene);
        const stored = key ? this.store?.get(key) : undefined;
        if (stored) return this.commit(index, { precomp: stored });

        const steps = this.precompSceneSteps(scene, index, this.profile?.scene(index, scene.name ?? `Scene ${index}`));
        let step = steps.next();
        while (!step.done) step = steps.next();
        this.remember(scene, step.value);
        return this.commit(index, step.value);
    }

    /**
     * Offer a freshly-measured pass to the host store.
     *
     * A scene that threw is never stored: `ScenePrecomp` carries no record of the
     * error, so a cached partial pass would replay as a *successful* short scene
     * on the next run and the error would vanish from the errors panel.
     *
     * Nor is a pass measured without lifespans (see {@link PrecompOptions.lifespans}):
     * it is a *partial* measurement, and a store is shared across callers — an
     * export writing one would silently strip the bars off the editor's timeline
     * the next time it read that scene back.
     */
    private remember(scene: Scene, outcome: ScenePassOutcome): void {
        if (!this.store || outcome.error || !this.trackLifespans) return;
        const key = storeKeyOf(scene);
        if (key) this.store.put(key, outcome.precomp);
    }

    /**
     * Execute a build pass over every scene and assemble the complete result.
     *
     * Synchronous and unbounded — for a long project this occupies the thread
     * until the last scene finishes. Prefer {@link runAsync} anywhere a UI is
     * waiting. A scene that throws is recorded in `buildErrors` rather than
     * aborting the whole pass, so other scenes still precomp.
     */
    run(): PrecompResult {
        for (let i = 0; i < this.scenes.length; i++) this.ensureScene(i);
        return this.assemble();
    }

    /**
     * Measure scenes in order until `done` is satisfied, then assemble what is
     * known. Scenes past the stopping point appear as unmeasured placeholders,
     * so the result's `totalFrames` covers only what was actually measured.
     *
     * @param done Called with the index just measured and its pass; return true
     *             to stop. Not called for scenes served from cache misses only —
     *             it sees every scene the loop touches, cached or not.
     */
    runUntil(done: (index: number, precomp: ScenePrecomp) => boolean): PrecompResult {
        for (let i = 0; i < this.scenes.length; i++) {
            if (done(i, this.ensureScene(i))) break;
        }
        return this.assemble();
    }

    /**
     * Measure every scene in order, yielding to the event loop so the page stays
     * responsive, and publishing a fresh result each time a scene lands.
     *
     * The yield points are complete frame boundaries only — the frame loop
     * mutates the scene tree, so suspending mid-frame would expose a torn state
     * to whatever runs next. `isCancelled` is re-checked as the *first* thing
     * after every resume, before touching anything, so an abandoned pass can
     * never mutate state a newer one has moved past.
     *
     * @returns the final result, or the last partial one if cancelled.
     */
    async runAsync(options: RunAsyncOptions = {}): Promise<PrecompResult> {
        const { budgetMs = DEFAULT_PRECOMP_BUDGET_MS, isCancelled, onProgress } = options;

        for (let i = 0; i < this.scenes.length; i++) {
            if (isCancelled?.()) return this.assemble();
            if (this.cache[i]) continue;

            const scene = this.scenes[i];
            // A stored pass makes this scene free — take it and publish, so a warm
            // project reaches a complete timeline without measuring anything.
            const key = storeKeyOf(scene);
            const stored = key ? this.store?.get(key) : undefined;
            if (stored) {
                this.commit(i, { precomp: stored });
                onProgress?.(this.assemble());
                continue;
            }

            const sceneProfile = this.profile?.scene(i, scene.name ?? `Scene ${i}`);
            const steps = this.precompSceneSteps(scene, i, sceneProfile);
            let deadline = now() + budgetMs;
            let step = steps.next();

            while (!step.done) {
                if (now() >= deadline) {
                    sceneProfile?.suspend();
                    await yieldToScheduler();
                    // Arbitrary code ran while we were parked — re-validate before
                    // resuming a generator that mutates a live scene tree.
                    if (isCancelled?.()) {
                        // Unwind the pass so its `finally` resets the scene rather
                        // than leaving it torn at a partial frame. The value handed
                        // in becomes the abandoned generator's return value, which
                        // we discard — this scene stays unmeasured.
                        steps.return({ precomp: pendingScenePrecomp() });
                        return this.assemble();
                    }
                    sceneProfile?.resume();
                    deadline = now() + budgetMs;
                }
                step = steps.next();
            }

            this.remember(scene, step.value);
            this.commit(i, step.value);
            onProgress?.(this.assemble());
        }

        return this.assemble();
    }

    /**
     * Re-run a single scene and produce a fresh result that reuses every other
     * scene's cached pass. The replaced scene's new frame count shifts all
     * downstream `startFrame`s and re-merges the global asset map; nothing about
     * the untouched scenes is recomputed.
     *
     * @param prev      The current result whose other scenes are reused.
     * @param index     Index of the scene to re-run.
     * @param newScene  The edited scene instance to swap in at `index`.
     */
    replaceScene(prev: PrecompResult, index: number, newScene: Scene): PrecompResult {
        this.scenes = this.scenes.slice();
        this.scenes[index] = newScene;

        // Drop the stale pass so ensureScene actually re-measures the edited scene.
        this.cache[index] = undefined;
        this.cachedErrors[index] = undefined;

        // Seed the cache from `prev` for any scene this instance hasn't measured
        // itself — a result can outlive the runner that produced it (a rehydrated
        // or handed-over one), and reusing its passes is the whole point here.
        for (let i = 0; i < this.scenes.length; i++) {
            const carried = prev.scenes[i];
            if (i !== index && !this.cache[i] && carried?.measured) {
                this.cache[i] = carried;
                this.cachedErrors[i] = prev.buildErrors.find(e => e.sceneIndex === i);
            }
        }

        // Only a *content*-keyed entry may serve this — see {@link StoreLookup}.
        // The fresh pass is offered back either way, so the host can persist it.
        this.measureScene(index, "content-only");
        return this.assemble();
    }

    /**
     * Assemble the current cache into a result. Scenes not yet measured appear as
     * zero-length placeholders so frame arithmetic stays valid — `measured` is
     * what distinguishes them, and `complete` reports whether any remain.
     */
    private assemble(): PrecompResult {
        const perScene: ScenePrecomp[] = [];
        const buildErrors: BuildError[] = [];
        let complete = true;

        for (let i = 0; i < this.scenes.length; i++) {
            const cached = this.cache[i];
            if (cached) {
                perScene.push(cached);
                const error = this.cachedErrors[i];
                if (error) buildErrors.push(error);
            } else {
                perScene.push(pendingScenePrecomp());
                complete = false;
            }
        }

        return assembleTimeline(
            perScene,
            buildErrors,
            this.fps,
            complete,
            this.collectTimings(),
            this._globals,
            this.assets,
        );
    }

    /** Store a completed pass and return it. */
    private commit(index: number, outcome: ScenePassOutcome): ScenePrecomp {
        this.cache[index] = outcome.precomp;
        this.cachedErrors[index] = outcome.error;
        return outcome.precomp;
    }

    private collectTimings(): PrecompTimings | undefined {
        const p = this.profile as (PrecompProfile & { timings?: PrecompTimings }) | undefined;
        return p?.timings ? p.timings.slice() : undefined;
    }

    /**
     * Drive one scene's generator to completion and collect its scene-local
     * precomp (frame count, asset usage, audio, lifespans). `startFrame` is left
     * 0 here and filled in by {@link assembleTimeline}.
     *
     * Written as a generator so the same loop serves both the synchronous and the
     * time-sliced driver — there is exactly one copy of the per-frame semantics,
     * and they cannot drift apart. It yields at complete frame boundaries only.
     * Abandoning it (`.return()`) runs the `finally` that disposes the tracker and
     * resets the scene, so a cancelled pass leaves nothing torn.
     */
    private *precompSceneSteps(
        scene: Scene,
        sceneIndex: number,
        profile?: ScenePrecompProfile,
    ): Generator<void, ScenePassOutcome, void> {
        const dt = 1 / this.fps;
        const layoutBounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };

        // A fresh, scene-local registry: frame ranges are relative to this scene's
        // own frame 0, so the pass is independent of where the scene sits on the
        // global timeline. assembleTimeline shifts these into absolute frames.
        const registry = new AssetTracker(this.assets);
        const stage = new BuildStage<Scene>(this.viewport, this.fps);

        // Global layers are not part of the scene tree (see `LayerStack`), so they
        // are driven alongside it: selected once here, then laid out and declared
        // with every frame below. That is what registers a watermark's font or a
        // background video's frames as assets — into the same registry the scene
        // uses, so a layer's asset window can't drift from what actually draws.
        const globals = this._globals;
        globals?.select(sceneIndex, scene.name ?? `Scene ${sceneIndex}`);

        scene.reset();
        scene.set({ width: this.viewport.width, height: this.viewport.height });
        scene.setViewport(this.viewport);
        scene.bindAssets(this.assets);
        // Mark the root context-bound (after reset restored defaults) so nodes the
        // generator adds below inherit context and run their init() on add. runInit
        // here fires init() for any nodes already present (e.g. config children).
        scene.bindContext(ContextMap.EMPTY, true);
        globals?.bindAssets(this.assets);
        globals?.bindContext(ContextMap.EMPTY);
        stage.reset();

        let localFrame = 0;
        const lifespans = new Map<string, NodeLifespan>();
        let error: BuildError | undefined;

        try {
            try {
                const generator = scene.build(stage);

                // Prime: advance to first yield so frame-0 nodes are registered.
                generator.next(dt);

                // A driven scene declares how long it runs rather than being run
                // to find out (see `createDrivenScene`). Its body never yields, so
                // the loop below would otherwise measure it as a single frame —
                // and its assets have to be collected across its real span, not
                // just at frame 0.
                const drivenFrames = drivenFrameCount(scene, this.fps);

                while (true) {
                    registry.start(localFrame);

                    // Fonts, and anything else measurement depends on, declared
                    // before layout can ask for it — which is the whole reason this
                    // phase exists separately. It used to be fire-and-forget async
                    // setup, with fonts inferred *from* `measureText` a line later;
                    // that ordering made it impossible to have a font loaded by the
                    // time the layout that discovered it ran.
                    profile?.enter("prepareLayout");
                    scene.prepareLayoutAssets(registry);
                    globals?.prepareLayoutAssets(registry);
                    profile?.enter("layout");
                    scene.layout(layoutBounds, this.measureScope);
                    globals?.layout(layoutBounds, this.measureScope);
                    // Everything drawable, plus the audio a playing clip schedules,
                    // declared with `layoutRect` live so a decode can be sized to
                    // what will actually be painted.
                    //
                    // There is no render pass here any more. Discovery used to mean
                    // replaying `scene.render()` against a context that walked every
                    // op list instead of rasterizing — a full tree walk per frame
                    // whose only product was this map. A node knows what it paints
                    // without being asked to paint it.
                    profile?.enter("prepareRender");
                    scene.prepareRenderAssets(registry);
                    globals?.prepareRenderAssets(registry);

                    registry.end();

                    // Record which nodes are alive this frame so the timeline can draw
                    // each node's bar over only its true lifespan. The scene's world
                    // lives on `scene.root` (path "" = root). Skipped entirely for a
                    // caller with no timeline to draw — see PrecompOptions.lifespans.
                    profile?.enter("lifespans");
                    if (this.trackLifespans) recordLifespans(scene.root, "", localFrame, lifespans);

                    localFrame++;
                    profile?.enter("bindAssets");
                    scene.bindAssets(this.assets);
                    // Structural re-push only (runInit=false): refresh context on any
                    // subtree added this frame without re-firing init mid-tween.
                    profile?.enter("bindContext");
                    scene.bindContext(ContextMap.EMPTY, false);
                    profile?.enter("ellapse");
                    scene.ellapse(localFrame * dt);
                    // Layers run on the same clock the scene does. Scene-local here,
                    // global during playback — the same split `Scene` itself already
                    // lives with (see `StateEvaluator.stepReplay`); it only affects
                    // which frame of a dynamic fill is sampled while measuring, never
                    // the frame ranges the asset windows are built from.
                    globals?.bindAssets(this.assets);
                    globals?.bindContext(ContextMap.EMPTY);
                    globals?.ellapse(localFrame * dt);

                    profile?.enter("generator");
                    if (drivenFrames !== null) {
                        // Put the tree into the next frame's state so the
                        // declarations above see it. Evaluating rather than
                        // stepping is the only difference; everything around it —
                        // the two declaration phases, layout, the lifespan record —
                        // is the same pass a generator scene gets.
                        if (localFrame >= drivenFrames) break;
                        scene.evaluateAt(localFrame * dt);
                    } else {
                        const result = generator.next(dt);
                        if (result.done) break;
                    }

                    // The one suspension point, and only here: the frame above is
                    // complete and the tree is internally consistent, so a
                    // time-sliced driver can park without exposing a torn state.
                    yield;
                }
            } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                error = {
                    sceneName: scene.name ?? `Scene ${sceneIndex}`,
                    sceneIndex,
                    message: e.message,
                    stack: e.stack,
                };
            }

            profile?.done(localFrame);

            // Scene-boundary blockade: a clip whose source outlasts the scene (e.g. a
            // long video on a short scene, or a startSound left running) must not
            // bleed past the cut. Clamp every request to [0, sceneDuration); drop any
            // that begins at or after the scene ends.
            const sceneDuration = localFrame / this.fps;
            const audioRequests = clampAudioToScene(registry.audioRequests, sceneDuration);

            // Snapshot the scene-local asset records before the registry is dropped
            // by the `finally` below (which runs after this return value is built).
            const assetRecords = new Map(registry.assets);

            return {
                precomp: {
                    measured: true,
                    frameCount: localFrame,
                    startFrame: 0, // assigned by assembleTimeline
                    audioRequests,
                    assetRecords,
                    lifespans,
                },
                error,
            };
        } finally {
            // Also runs when a time-sliced driver abandons the pass mid-scene via
            // `.return()`, so a cancelled precomp never leaves the scene torn at a
            // partial frame or the tracker holding a live frame bracket.
            registry.dispose();
            scene.reset();
        }
    }
}

/**
 * The key a scene is stored under in a {@link PrecompCache}, or `undefined` when
 * it has no stable identity and therefore must not be cached.
 *
 * `__precompKey` wins when a host has set one: it identifies the scene's
 * *content*, so equal keys imply equal passes and the store needs no separate
 * validity check. Hosts whose scenes change without changing their slot — an
 * editor, where every keystroke edits the scene sitting in slot *n* — must set
 * it, because `__sceneHotId` below is deliberately stable across exactly those
 * edits and would serve the pre-edit measurement forever.
 *
 * `__sceneHotId` is the fallback: the scene file's project-relative path,
 * stamped by the vite-plugin's `?scene` transform — the same identity hot
 * reloading matches on, and a sound key for that host because it validates its
 * entries by re-hashing each one's recorded source dependencies.
 *
 * A scene with neither has nothing stable to key on: class names collide and
 * array position changes when a scene is added. Those scenes simply measure
 * every time, which is correct rather than merely safe — a wrong key would serve
 * one scene's timings for another.
 */
function storeKeyOf(scene: Scene): string | undefined {
    return scene.__precompKey || scene.__sceneHotId || undefined;
}

/**
 * Which host-store keys are trustworthy for a given lookup.
 *
 * `"any"` is the normal path. `"content-only"` is {@link Precomp.replaceScene}'s:
 * a scene has just been edited, so a key that names the scene's *slot* rather
 * than its content now points at the pre-edit measurement and must be refused.
 *
 * The distinction falls straight out of {@link storeKeyOf}'s two key kinds.
 * `__sceneHotId` is a slot: the vite-plugin stamps the scene file's path, which
 * is deliberately stable across exactly the edits that bring us here, and that
 * host validates its entries separately by re-hashing recorded source deps — so
 * on this path it is refused. `__precompKey` is the content itself, so a changed
 * scene *is* a changed key and a hit can only be the right pass; refusing it
 * throws away the one mechanism built for this case, which for an editor is every
 * keystroke in the inspector.
 */
type StoreLookup = "any" | "content-only";

/** The key that names a scene's content, or nothing if the host didn't set one. */
function contentKeyOf(scene: Scene): string | undefined {
    return scene.__precompKey || undefined;
}

/** A placeholder for a scene that hasn't been measured yet. See {@link ScenePrecomp.measured}. */
function pendingScenePrecomp(): ScenePrecomp {
    return {
        measured: false,
        frameCount: 0,
        startFrame: 0,
        audioRequests: [],
        assetRecords: new Map(),
        lifespans: new Map(),
    };
}

// ─── Timeline assembly ──────────────────────────────────────────────────────

/**
 * Compose per-scene passes into the final {@link PrecompResult}: assign each
 * scene its global `startFrame`, sum the total, and merge every scene's
 * scene-local asset usage into one absolute-frame asset map.
 *
 * Kept separate from the per-scene pass so every entry point shares the exact
 * same assembly — the only thing they change is which scenes' passes are fresh,
 * reused, or still-pending placeholders.
 *
 * Pure and cheap, which is what makes it safe to re-run on every progressive
 * publish: it re-derives `startFrame`s, the merged asset map and open-audio
 * resolution from scratch each time, so a growing set of measured scenes always
 * yields a self-consistent result.
 */
function assembleTimeline(
    perScene: ScenePrecomp[],
    buildErrors: BuildError[],
    fps: number,
    complete: boolean = true,
    timings?: PrecompTimings,
    globals?: ProjectGlobals,
    catalog?: AssetCatalog,
): PrecompResult {
    let offset = 0;
    const scenes: ScenePrecomp[] = [];
    // Merge scene-local records into absolute-frame records, unioning ranges for
    // assets shared across scenes (and taking the max decode size).
    const mergedRecords = new Map<string, AssetRecord>();

    for (const sp of perScene) {
        const placed: ScenePrecomp = { ...sp, startFrame: offset };
        scenes.push(placed);

        for (const [key, record] of sp.assetRecords) {
            mergeRecord(mergedRecords, key, shiftRecord(record, offset));
        }

        offset += sp.frameCount;
    }

    const totalFrames = offset;
    const totalDuration = totalFrames / fps;

    // Resolve cross-scene OPEN requests now that the project total is known. Audio
    // requests stay scene-local (the asset manager re-adds each scene's offset when
    // it plays them), so we resolve the absolute end and store it back as a
    // scene-local `endAt` (= absoluteEnd - sceneOffset). A non-looped open request
    // ends at min(start + mediaDuration, projectEnd); a looped one runs to projectEnd.
    //
    // This runs on every assembly (including HMR `replaceScene` and every
    // progressive publish from `runAsync`) and is idempotent: `endAt` is re-derived
    // from `startAt`/`mediaDuration`/`loop` rather than from its own prior value, and
    // the `open` marker is PRESERVED. So a bed resolved against a partial total while
    // precomp is still running is simply re-resolved, correctly, once later scenes
    // land — and editing a later scene that changes the total re-resolves it too.
    // Resolution writes into fresh copies so cached per-scene passes are never mutated.
    for (let i = 0; i < scenes.length; i++) {
        scenes[i] = resolveOpenAudio(scenes[i], fps, totalDuration);
    }

    // Project-level audio beds are bounded by the same total, and for the same
    // reason re-derived here rather than cached: the total grows scene by scene
    // while the background precomp runs.
    const globalAudio = globals && catalog
        ? resolveProjectAudio(globals, catalog, totalDuration, buildErrors)
        : [];

    return {
        fps,
        scenes,
        globalAudio,
        totalFrames,
        totalDuration,
        assets: buildAssetMap(mergedRecords, fps),
        buildErrors,
        complete,
        timings,
    };
}

/**
 * Index reported for a {@link BuildError} that belongs to the project itself
 * rather than to any one scene (a bad `audioTracks` entry). Negative so a
 * consumer keying errors by scene simply never matches it.
 */
const PROJECT_SCENE_INDEX = -1;

/**
 * Resolve `audioTracks` into absolute-time requests, appending any problem
 * (unknown `src`, inverted trim) to `buildErrors` so it surfaces in the player's
 * errors panel instead of the track silently not playing.
 */
function resolveProjectAudio(
    globals: ProjectGlobals,
    catalog: AssetCatalog,
    totalDuration: number,
    buildErrors: BuildError[],
): AudioRequest[] {
    if (globals.audioTracks.length === 0) return [];
    const { requests, errors } = resolveGlobalAudio(globals.audioTracks, catalog, totalDuration);
    for (const message of errors) {
        buildErrors.push({ sceneName: "audioTracks", sceneIndex: PROJECT_SCENE_INDEX, message });
    }
    return requests;
}

/**
 * Return a copy of `scene` with every {@link AudioRequest.open} request's `endAt`
 * resolved against the project total. The `open`/`mediaDuration` markers are kept so
 * a later re-assembly (HMR) re-resolves; only `endAt` changes. Bounded requests and
 * scenes with no open requests are returned without copying their request arrays.
 */
function resolveOpenAudio(scene: ScenePrecomp, fps: number, totalDuration: number): ScenePrecomp {
    if (!scene.audioRequests.some((r) => r.open)) return scene;

    const sceneOffset = scene.startFrame / fps;
    const audioRequests = scene.audioRequests.map((req) => {
        if (!req.open) return req;
        const absStart = sceneOffset + req.startAt;
        const naturalEnd = req.loop
            ? totalDuration
            : Math.min(absStart + (req.mediaDuration ?? 0), totalDuration);
        return { ...req, endAt: Math.max(req.startAt, naturalEnd - sceneOffset) };
    });
    return { ...scene, audioRequests };
}

/** Shift an asset record's frame range into the global timeline by `offset`. */
function shiftRecord(record: AssetRecord, offset: number): AssetRecord {
    if (offset === 0) return record;
    return { ...record, startFrame: record.startFrame + offset, endFrame: record.endFrame + offset };
}

/**
 * Merge `record` into `out[key]`, unioning frame ranges and taking the max
 * decode size — so an asset used in several scenes resolves to a single track
 * spanning its full usage, exactly as the old shared-registry pass produced.
 */
function mergeRecord(out: Map<string, AssetRecord>, key: string, record: AssetRecord): void {
    const existing = out.get(key);
    if (!existing) {
        out.set(key, record);
        return;
    }
    const merged: AssetRecord = {
        ...existing,
        startFrame: Math.min(existing.startFrame, record.startFrame),
        endFrame: Math.max(existing.endFrame, record.endFrame),
    } as AssetRecord;
    if ((merged.type === 'image' || merged.type === 'video') &&
        (record.type === 'image' || record.type === 'video')) {
        (merged as { width: number }).width = Math.max(merged.width, record.width);
        (merged as { height: number }).height = Math.max(merged.height, record.height);
    }
    out.set(key, merged);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Frames a driven scene runs for, or `null` when the scene is generator-driven
 * and has to be run to find out.
 *
 * Rounded up, so a duration that does not land on a frame boundary still gets
 * its last, partial frame drawn rather than being truncated away. Floored at one:
 * a zero-duration driven scene is still a scene, and measuring it as no frames
 * would drop it from the timeline entirely.
 */
function drivenFrameCount(scene: Scene, fps: number): number | null {
    const duration = scene.drivenDuration;
    // Tested for being a real number rather than for `!== null`: a scene is only
    // driven if it can say how long for, and anything else — a generator scene's
    // `null`, a stand-in that never implemented this — belongs on the replay path.
    if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
    return Math.max(1, Math.ceil(duration * fps));
}

/**
 * Walk the scene's live node tree and extend each node's lifespan to include
 * `frame`, keyed by structural path (see {@link nodePath}). A node's lifespan
 * starts the first frame its slot appears and ends the last frame it is still
 * present, so nodes added or removed mid-scene get a range narrower than the
 * scene itself. The scene root (path "") is included so its own bar spans the
 * whole scene.
 */
function recordLifespans(node: Node, path: string, frame: number, out: Map<string, NodeLifespan>): void {
    const existing = out.get(path);
    if (existing) {
        existing.endFrame = frame;
    } else {
        out.set(path, { startFrame: frame, endFrame: frame });
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        recordLifespans(children[i], nodePath(path, i), frame, out);
    }
}

/**
 * Confine a scene's **bounded** audio requests to its own `[0, sceneDuration)` span.
 *
 * Scenes are independent, so this is the cut between two sibling scenes: a bounded
 * clip whose source outlasts the scene — e.g. a long video on a short scene, or a
 * `playSound`/stopped/trimmed clip — must not sound or draw past the scene boundary.
 *
 * Each bounded request is clipped to the span: a `startAt` at or after the end drops
 * the request; an `endAt` past the end is pulled back to the boundary.
 *
 * **Open** requests (a `startSound` left running, not stopped/trimmed) are the sole
 * exception: they are allowed to outlive their scene and pass through untouched here,
 * to be shifted and resolved against the project total in {@link assembleTimeline}.
 */
function clampAudioToScene(requests: readonly AudioRequest[], sceneDuration: number): AudioRequest[] {
    const out: AudioRequest[] = [];
    for (const req of requests) {
        if (req.open) {
            // Cross-scene: keep scene-local startAt; end is resolved at assembly.
            out.push({ ...req });
            continue;
        }
        if (req.startAt >= sceneDuration) continue;
        const endAt = Math.min(req.endAt, sceneDuration);
        if (endAt <= req.startAt) continue;
        out.push(endAt === req.endAt ? { ...req } : { ...req, endAt });
    }
    return out;
}

/**
 * Lead-time tuning constants.
 *
 * LEADS_PER_MB: frames of lead time granted per decoded megabyte.
 * A 4K image (~32 MB) gets ~64 frames; a 256×256 thumbnail (~0.25 MB) gets
 * MIN_LEAD. These are intentionally conservative starting values.
 */
const LEADS_PER_MB = 2;
const MIN_LEAD = 2;
const MAX_LEAD = 120;
/** Frames to keep an asset alive after its last use (backward-scrub headroom). */
const TAIL_FRAMES = 30;

/** Decoded RGBA memory footprint of a frame with the given pixel dimensions. */
function decodedMB(width: number, height: number): number {
    return (width * height * 4) / (1024 * 1024);
}

/** Clamp-scaled lead time in frames for an asset of `mb` decoded megabytes. */
function leadFrames(mb: number): number {
    return Math.min(MAX_LEAD, Math.max(MIN_LEAD, Math.round(mb * LEADS_PER_MB)));
}

/**
 * Convert merged absolute-frame asset records into the typed `AssetTrack` map
 * consumed by `AssetManager`. Each asset type gets a `cacheAt` / `discardAt`
 * window based on its decoded size and usage range. Fonts are pinned at frame 0
 * and never evicted; images and video get size-proportional lead time.
 */
function buildAssetMap(records: ReadonlyMap<string, AssetRecord>, fps: number): ReadonlyMap<string, AssetTrack> {
    const out = new Map<string, AssetTrack>();

    for (const [key, entry] of records) {
        switch (entry.type) {
            case "image": {
                const mb = decodedMB(entry.width, entry.height);
                const lead = leadFrames(mb);
                out.set(key, {
                    record: entry,
                    cacheAt: Math.max(0, entry.startFrame - lead),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
            }
            case "video": {
                const mb = decodedMB(entry.width, entry.height);
                // Video decode is heavier than image: double the lead, then
                // also add a fixed buffer so short clips still get real headroom.
                const lead = Math.min(MAX_LEAD, leadFrames(mb) * 2 + Math.round(fps));
                out.set(key, {
                    record: entry,
                    cacheAt: Math.max(0, entry.startFrame - lead),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
            }
            case "font":
                // Fonts are tiny and referenced throughout; always load at frame 0
                // and never evict.
                out.set(key, {
                    record: entry,
                    cacheAt: 0,
                    discardAt: null,
                });
                break;
            case "loader":
                // Opaque loaders (e.g. a syntax-highlight language) are cheap and
                // needed for the whole span they're requested over. Load ahead of
                // the first use and keep a backward-scrub tail before disposing.
                out.set(key, {
                    record: entry,
                    cacheAt: Math.max(0, entry.startFrame - MAX_LEAD),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
        }
    }

    return out;
}
