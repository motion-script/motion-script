import { AudioRequest } from "@/attributes/audio/request";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { Measurer2D } from "../render/measurer";
import { AssetRecord } from "@/assets/record";
import { Node, type AttachScope } from "@/nodes/node/node";
import { nodePath } from "@/project/tree";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { CanvasAssetTracker } from "@/assets/tracker";
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
 * Everything learned from walking one scene across its declared span, in
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
     * Whether this scene has actually been measured yet.
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
 * The distinct pieces of work {@link Precomp.precompSceneSteps} performs at each
 * sample. Each is a full walk of the scene's node tree (except `evaluate`, which
 * is the scene's own command evaluation), so attributing wall-clock to them is
 * what tells you which one to optimize.
 *
 * A *sample* is not a frame. A scene that can name its key times is measured at
 * those and nowhere else, so these totals are per boundary rather than per
 * frame; only a scene walked frame by frame makes the two the same thing.
 */
export type PrecompPhase =
    | "prepareLayout"
    | "layout"
    | "prepareRender"
    | "lifespans"
    | "attach"
    | "evaluate";

const PRECOMP_PHASES: readonly PrecompPhase[] = [
    "prepareLayout", "layout", "prepareRender",
    "lifespans", "attach", "evaluate",
];

/** Wall-clock breakdown of one scene's build pass, in milliseconds. */
export interface ScenePrecompTiming {
    sceneName: string;
    sceneIndex: number;
    frameCount: number;
    /** Total ms spent inside the pass, excluding time parked on a yield. */
    totalMs: number;
    /** Ms attributed to each phase, summed over every sample. */
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
    /** Errors thrown while building a scene. */
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
 * Each scene is walked across its declared span (without rendering) to learn its
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
 * fully measured before anything else walks it. `Precomp` and
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
    private readonly measurer: Measurer2D;
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
    /**
     * Bumped every time the scene list is changed under this instance —
     * {@link setScenes} and {@link replaceScene}.
     *
     * {@link runAsync} is an **index-based scan over mutable shared state**: it
     * walks `scenes`, parks on a yield, and commits into `cache[i]` when it
     * resumes. Nothing stopped a host from replacing both arrays while it was
     * parked, and the consequence was not merely wasted work — the pass it had
     * measured was committed at an index that by then held a *different scene*,
     * so that scene took on someone else's frame count and someone else's asset
     * windows. A frame then draws a picture whose window was never opened, which
     * is the `AssetNotLoadedError` an image fill throws; and a scene reports a
     * length that belongs to its neighbour.
     *
     * A scan compares this against the value it started with after every yield
     * and, when it differs, unwinds the scene it was on and starts again from
     * the top of the new list. Restart rather than abandon: the host that
     * changed the list is normally *adding* a scene, and a pass that gave up
     * would leave the newcomer unmeasured — a zero-length hole in the timeline,
     * which is the other half of the same bug.
     */
    private revision = 0;

    constructor(
        scenes: Scene[],
        viewport: Size2D,
        fps: number,
        assets: AssetCatalog,
        measurer: Measurer2D,
        options: PrecompOptions = {},
    ) {
        this.scenes = scenes;
        this.viewport = viewport;
        this.fps = fps;
        this.assets = assets;
        this.measurer = measurer;
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
     * The one place a scene is actually measured, and idempotent: a second call
     * is a cache read. Every other entry point is a policy for choosing *when* to
     * call this.
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

        // The list this scan believes it is walking. See {@link revision} for why
        // an index-based scan over a list the host may replace has to say so.
        let revision = this.revision;

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
            /** Set when this walk's own scene has left the list — see below. */
            let superseded = false;
            /** Set when the list moved at all, so the scan starts again after. */
            let rescan = false;

            while (!step.done) {
                if (now() >= deadline) {
                    sceneProfile?.suspend();
                    await yieldToScheduler();
                    // Arbitrary code ran while we were parked — re-validate before
                    // resuming a pass that mutates a live scene tree.
                    if (isCancelled?.()) {
                        // Unwind the pass so its `finally` resets the scene rather
                        // than leaving it torn at a partial frame. The value handed
                        // in becomes the abandoned walk's return value, which we
                        // discard — this scene stays unmeasured.
                        steps.return({ precomp: pendingScenePrecomp() });
                        return this.assemble();
                    }
                    if (this.revision !== revision) {
                        revision = this.revision;
                        // The scan has to start again whatever happened: a scene
                        // may have been inserted *before* the point it had reached,
                        // and `i` no longer names what it did.
                        rescan = true;
                        // Whether this particular walk survives is a different
                        // question, and the answer is whether its scene is still in
                        // the list. One that has been dropped is disposed by the
                        // evaluator on the same tick, so resuming its walk would
                        // drive a dead tree — unwind it, and let the `finally` put
                        // it back rather than leave it torn at a partial frame.
                        //
                        // One that is *still* there keeps going. Abandoning it too
                        // would have been simpler and is what this did first, and
                        // it was quietly expensive: an editor hot-replaces on every
                        // keystroke, so a project still measuring in the background
                        // threw away its longest scene's partial walk over and over
                        // and never converged.
                        if (!this.scenes.includes(scene)) {
                            steps.return({ precomp: pendingScenePrecomp() });
                            superseded = true;
                            break;
                        }
                    }
                    sceneProfile?.resume();
                    deadline = now() + budgetMs;
                }
                step = steps.next();
            }

            // `break` above leaves `step` un-`done`, so the outcome is only real
            // on the path that ran the walk out.
            const outcome = step.done ? step.value : null;

            // A pass may only be committed at an index that still holds the scene
            // it measured. This is the check that makes the whole arrangement
            // safe: without it a walk that resumed after `setScenes` wrote its
            // frame count and its asset windows onto whatever scene had taken the
            // slot, which draws a picture whose window was never opened.
            const stale = superseded || outcome === null || this.scenes[i] !== scene;
            if (!stale) {
                this.remember(scene, outcome);
                this.commit(i, outcome);
                onProgress?.(this.assemble());
            }

            if (stale || rescan) {
                // Start the scan again over the list as it now stands. Everything
                // already measured is in `cache` and costs one comparison to skip,
                // so a restart is O(scenes) rather than O(work) — and it is what
                // gets a scene the host just *added* measured, rather than left as
                // a zero-length hole for the rest of the session.
                revision = this.revision;
                i = -1;
                continue;
            }
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
        // Announced before anything moves, so a background scan parked on a yield
        // sees the change the instant it resumes. See {@link revision}.
        this.revision++;
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
     * Replace the whole scene list, carrying every measurement that still applies.
     *
     * The set-level counterpart to {@link replaceScene}, and the reason adding a
     * scene need not cost a full re-measure. A pass is carried over when the new
     * scene is the **same instance** as one already measured, or when it declares
     * the same `precompKey` — a content key, so equal keys really do imply equal
     * passes.
     *
     * Carrying by content rather than by position is what makes an insert cheap,
     * and it is sound because a per-scene pass is **position-independent**:
     * `assembleTimeline` assigns every `startFrame` from a running offset, so
     * inserting or reordering shifts offsets and invalidates no measurement.
     *
     * @param prev The current result, whose passes are reused where they apply.
     * @param next The new scene list, in timeline order.
     */
    setScenes(prev: PrecompResult, next: Scene[]): PrecompResult {
        // Announced first, for the reason {@link revision} gives: a background
        // scan is parked somewhere in the arrays this method is about to rewrite.
        this.revision++;
        // Everything measured so far, indexed both ways a survivor can be named.
        const byInstance = new Map<Scene, ScenePrecomp>();
        const byKey = new Map<string, ScenePrecomp>();
        const errorByInstance = new Map<Scene, BuildError | undefined>();
        const errorByKey = new Map<string, BuildError | undefined>();

        for (let i = 0; i < this.scenes.length; i++) {
            const pass = this.cache[i] ?? (prev.scenes[i]?.measured ? prev.scenes[i] : undefined);
            if (!pass) continue;
            const scene = this.scenes[i];
            const error = this.cachedErrors[i] ?? prev.buildErrors.find(e => e.sceneIndex === i);
            byInstance.set(scene, pass);
            errorByInstance.set(scene, error);
            const key = scene.precompKey;
            if (key && !byKey.has(key)) {
                byKey.set(key, pass);
                errorByKey.set(key, error);
            }
        }

        this.scenes = next.slice();
        this.cache.length = 0;
        this.cachedErrors.length = 0;

        for (let i = 0; i < next.length; i++) {
            const scene = next[i];
            const key = scene.precompKey;
            const carried = byInstance.get(scene) ?? (key ? byKey.get(key) : undefined);
            this.cache[i] = carried;
            // A carried error travels with the pass it belongs to, re-stamped for
            // the slot the scene now sits in — the index is the one thing about a
            // pass that is positional.
            const error = byInstance.has(scene)
                ? errorByInstance.get(scene)
                : key ? errorByKey.get(key) : undefined;
            this.cachedErrors[i] = error ? { ...error, sceneIndex: i } : undefined;
        }

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
     * Put the tree into the state for `seconds` and declare everything it needs,
     * once per entry in `frames`.
     *
     * The three calls are ordered, not grouped for tidiness. Fonts — and anything
     * else measurement depends on — have to be named *before* the layout that
     * asks for them; everything drawable is declared *after* it, with
     * `layoutBounds` live, so a decode can be sized to what will actually be
     * painted. (There is no render pass: a node knows what it paints without
     * being asked to paint it.)
     *
     * `frames` repeats the declaration under a second open frame rather than
     * re-laying out, because the tree has not moved between them — only the frame
     * the tracker attributes it to. See the interval sampling in
     * {@link precompSceneSteps} for why one state is attributed to two frames.
     */
    private sampleScene(
        scene: Scene,
        globals: ProjectGlobals | null | undefined,
        registry: CanvasAssetTracker,
        profile: ScenePrecompProfile | undefined,
        layoutBounds: BoxBounds,
        seconds: number,
        frames: readonly number[],
    ): void {
        profile?.enter("attach");
        // Layers run on the same clock the scene does. Scene-local here, global
        // during playback — it only affects which frame of a dynamic fill is
        // sampled while measuring, never the frame ranges the windows are built
        // from.
        const scope: AttachScope = { assets: this.assets, context: ContextMap.EMPTY, time: seconds };
        scene.attach(scope);
        globals?.attach(scope);

        profile?.enter("evaluate");
        scene.evaluateAt(seconds);

        registry.start(frames[0]);
        profile?.enter("prepareLayout");
        scene.prepareLayoutAssets(registry);
        globals?.prepareLayoutAssets(registry);
        profile?.enter("layout");
        scene.layout(layoutBounds, this.measurer);
        globals?.layout(layoutBounds, this.measurer);
        profile?.enter("prepareRender");
        scene.prepareRenderAssets(registry);
        globals?.prepareRenderAssets(registry);
        registry.end();

        for (let i = 1; i < frames.length; i++) {
            if (frames[i] === frames[i - 1]) continue;
            registry.start(frames[i]);
            scene.prepareLayoutAssets(registry);
            globals?.prepareLayoutAssets(registry);
            scene.prepareRenderAssets(registry);
            globals?.prepareRenderAssets(registry);
            registry.end();
        }
    }

    /**
     * Sample one scene across its declared span and collect its scene-local
     * precomp (frame count, asset usage, audio, lifespans). `startFrame` is left
     * 0 here and filled in by {@link assembleTimeline}.
     *
     * **Where the samples fall is the scene's answer, not this pass's.** A scene
     * that can name its key times — a command's start, its end, a node's arrival
     * or departure — is measured at those and nowhere else, because between two
     * of them nothing changes discontinuously and the frames in between have
     * nothing new to say. A scene that cannot is walked frame by frame, which is
     * always correct and merely slower. See {@link sampleIntervals}.
     *
     * Written as a generator so the same loop serves both the synchronous and the
     * time-sliced driver — there is exactly one copy of the semantics, and they
     * cannot drift apart. (That generator is an *iteration protocol* for
     * time-slicing this pass, not an animation: the scene is asked for a time,
     * never advanced to it.) It yields only where the tree is internally
     * consistent. Abandoning it (`.return()`) runs the `finally` that disposes
     * the tracker and resets the scene, so a cancelled pass leaves nothing torn.
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
        const registry = new CanvasAssetTracker(this.assets);
        const stage = new CanvasStage(this.viewport, this.fps);

        // Global layers are not part of the scene tree (see `LayerStack`), so they
        // are driven alongside it: selected once here, then laid out and declared
        // with every frame below. That is what registers a watermark's font or a
        // background video's frames as assets — into the same registry the scene
        // uses, so a layer's asset window can't drift from what actually draws.
        const globals = this._globals;
        globals?.select(sceneIndex, scene.name ?? `Scene ${sceneIndex}`);

        scene.reset();
        scene.setViewport(this.viewport);
        // Attach the fresh canvas so nodes the build adds below inherit context
        // and are mounted on insertion.
        const scope: AttachScope = { assets: this.assets, context: ContextMap.EMPTY, time: 0 };
        scene.attach(scope);
        globals?.attach(scope);
        stage.reset();

        let localFrame = 0;
        /** The scene's declared length, filled in as soon as it is known. */
        let frameCount = 0;
        const lifespans = new Map<string, NodeLifespan>();
        let error: BuildError | undefined;

        try {
            try {
                stage.build(scene);
                // Lay out before compiling, for the reason `SceneDriver.compile`
                // gives: a command pinning to a rendered box reads zero until a
                // layout pass has run.
                scene.layout(layoutBounds, this.measurer);
                scene.compile();

                // A scene declares how long it runs; nothing has to be run to
                // find out. That declaration is the whole reason this pass is
                // bounded — measuring a generator scene meant driving it to
                // completion, so the cost of *knowing* a scene's length was the
                // cost of playing it.
                const totalFrames = sceneFrameCount(scene, this.fps);
                // Declared, so it is known before a single frame is sampled — and
                // it is the answer even if a sample below throws, because the
                // scene's length was never a product of walking it.
                frameCount = totalFrames;

                // Every time this scene can *change*: a command's start or end, a
                // node's arrival or departure. Between two of them nothing changes
                // discontinuously, so the pair bounds the interval and the frames
                // in between have nothing new to say. A driver that cannot name
                // its boundaries returns null and gets the frame-by-frame walk,
                // which is always correct and merely slower.
                const intervals = sampleIntervals(scene, this.fps, totalFrames);

                if (intervals) {
                    for (let i = 0; i < intervals.length; i++) {
                        const span = intervals[i];
                        // **Both endpoints are attributed to the whole interval**,
                        // and the symmetry is the correctness argument rather than
                        // a convenience. What the sampling claim actually says is
                        // that the frames inside `[a, b]` draw from the *union* of
                        // what `a` and `b` draw from — nothing appears or vanishes
                        // in between — so both states have to open a window over
                        // the whole span, not over the frame they happened to be
                        // evaluated at.
                        //
                        // Attributing only the end state to both frames (which is
                        // what this used to do) covers exactly one direction: an
                        // asset *arriving* at `b`. An asset **leaving** at `b` was
                        // declared under `a` alone, so its window closed at `a`
                        // while every frame of `(a, b)` still painted it — a rect
                        // whose image fill tweens to a colour came out with the
                        // window `[0, 10]` where the frame-by-frame walk gives
                        // `[0, 19]`, and a node removed part-way through came out
                        // with `[0, 0]` against `[0, 9]`. `AssetManager.loadAt`
                        // then declines to load a picture the frame is about to
                        // ask for, and the draw throws `AssetNotLoadedError`.
                        //
                        // Neither half is padding. `lerpFillArray` cross-fades a
                        // non-lerpable pair, so a colour ↔ image tween paints both
                        // fills through the middle of the interval while
                        // `imageFill.lerp` only switches `src` at t = 0.5.
                        // Endpoint-only attribution opens or closes the decode on
                        // the wrong side of the frames that need it. Early is free;
                        // late is a frame reaching for a decode that is not there.
                        //
                        // Ascending in time, always. Anything stamped from the
                        // scene clock as it is declared — an audio request's
                        // `startAt` above all — is only right if the first sample
                        // that discovers it is the earliest one that has it, and
                        // the extra open frame changes which frame a window covers
                        // rather than which *time* the tree was evaluated at.
                        this.sampleScene(scene, globals, registry, profile, layoutBounds,
                            span.startSeconds, [span.startFrame, span.endFrame]);
                        if (this.trackLifespans) {
                            recordLifespans(scene.canvas, "", span.startFrame,
                                Math.max(span.startFrame, span.endFrame - 1), lifespans);
                        }

                        this.sampleScene(scene, globals, registry, profile, layoutBounds,
                            span.endSeconds, [span.startFrame, span.endFrame]);
                        if (this.trackLifespans) {
                            recordLifespans(scene.canvas, "", span.endFrame, span.endFrame, lifespans);
                        }

                        profile?.enter("evaluate");
                        // The one suspension point, and only here: the interval
                        // above is complete and the tree is internally consistent,
                        // so a time-sliced driver can park without exposing a torn
                        // state.
                        if (i < intervals.length - 1) yield;
                    }
                    localFrame = totalFrames;
                } else {
                while (true) {
                        // Put the tree into *this* frame's state before anything reads
                        // it. It belongs here rather than at the bottom of the loop:
                        // building compiles every node's command chain, and compiling
                        // walks each step to its end, restoring only the node's own
                        // props afterwards. Whatever a command wrote to some *other*
                        // node — a chart arming its markers, a diagram its tiles — is
                        // still sitting there. So the tree straight out of `build`
                        // holds the last command's state, not the first's, and
                        // declaring frame 0 against it collects the wrong frame's
                        // assets. Playback then draws frame 0 and reaches for one
                        // nothing ever declared.
                        scene.evaluateAt(localFrame * dt);

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
                        scene.layout(layoutBounds, this.measurer);
                        globals?.layout(layoutBounds, this.measurer);
                        // Everything drawable, plus the audio a playing clip schedules,
                        // declared with `layoutBounds` live so a decode can be sized to
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
                        // lives on `scene.canvas` (path "" = root). Skipped entirely for a
                        // caller with no timeline to draw — see PrecompOptions.lifespans.
                        profile?.enter("lifespans");
                        if (this.trackLifespans) recordLifespans(scene.canvas, "", localFrame, localFrame, lifespans);

                        localFrame++;
                        profile?.enter("attach");
                        const frameScope: AttachScope = {
                            assets: this.assets,
                            context: ContextMap.EMPTY,
                            // Layers run on the same clock the scene does. Scene-local
                            // here, global during playback — the same split `Scene`
                            // itself already lives with (see
                            // `StateEvaluator.stepReplay`); it only affects which frame
                            // of a dynamic fill is sampled while measuring, never the
                            // frame ranges the asset windows are built from.
                            time: localFrame * dt,
                        };
                        scene.attach(frameScope);
                        globals?.attach(frameScope);

                        profile?.enter("evaluate");
                        if (localFrame >= totalFrames) break;

                        // The one suspension point, and only here: the frame above is
                        // complete and the tree is internally consistent, so a
                        // time-sliced driver can park without exposing a torn state.
                        yield;
                    }
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

            profile?.done(frameCount);

            // Scene-boundary blockade: a clip whose source outlasts the scene (e.g. a
            // long video on a short scene, or a startSound left running) must not
            // bleed past the cut. Clamp every request to [0, sceneDuration); drop any
            // that begins at or after the scene ends.
            const sceneDuration = frameCount / this.fps;
            const audioRequests = clampAudioToScene(registry.audioRequests, sceneDuration);

            // Snapshot the scene-local asset records before the registry is dropped
            // by the `finally` below (which runs after this return value is built).
            const assetRecords = new Map(registry.assets);

            return {
                precomp: {
                    measured: true,
                    frameCount,
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

/** One span between two consecutive key times, in both seconds and frames. */
interface SampleInterval {
    startSeconds: number;
    startFrame: number;
    endSeconds: number;
    endFrame: number;
}

/**
 * The intervals a boundary-sampled pass walks, or `null` when this scene cannot
 * name its boundaries and must be walked frame by frame.
 *
 * Consecutive key times bound an interval over which nothing changes
 * discontinuously — the same nodes, drawn from the same assets, with every prop
 * a continuous interpolation of the same values — so the two endpoints between
 * them say everything the frames in between would. That collapses the pass from
 * O(frames) to O(commands), which for a ten-second scene with three tweens is
 * four samples instead of six hundred.
 *
 * Times are snapped to real frame indices and clamped into the scene, because
 * the tracker's records and the timeline's bars are both in frames: a key time
 * at the scene's exact end is the last frame, not one past it.
 */
function sampleIntervals(scene: Scene, fps: number, totalFrames: number): SampleInterval[] | null {
    const times = scene.keyTimes();
    if (!times) return null;

    const last = totalFrames - 1;
    const frameOf = (t: number) => Math.min(last, Math.max(0, Math.round(t * fps)));

    // Sorted and deduplicated here rather than trusted from the driver: two
    // commands sharing an `at` is how the model spells "in parallel", so
    // duplicates are the normal case, and a host supplying its own boundaries has
    // no reason to have ordered them.
    const keys: number[] = [];
    for (const t of [...times].sort((a, b) => a - b)) {
        if (!Number.isFinite(t)) continue;
        if (keys.length === 0 || t > keys[keys.length - 1]) keys.push(t);
    }
    if (keys.length === 0) keys.push(0);
    // A still — one state, held for the scene's whole span.
    if (keys.length === 1) {
        return [{ startSeconds: keys[0], startFrame: frameOf(keys[0]), endSeconds: keys[0], endFrame: last }];
    }

    const out: SampleInterval[] = [];
    for (let i = 0; i < keys.length - 1; i++) {
        out.push({
            startSeconds: keys[i],
            startFrame: frameOf(keys[i]),
            endSeconds: keys[i + 1],
            endFrame: frameOf(keys[i + 1]),
        });
    }
    return out;
}

/**
 * The key a scene is stored under in a {@link PrecompCache}, or `undefined` when
 * it has no stable identity and therefore must not be cached.
 *
 * `Scene.precompKey` identifies the scene's *content*, so equal keys imply
 * equal passes and the store needs no separate validity check. A host whose
 * scenes change without changing their slot — an editor, where every keystroke
 * edits the scene sitting in slot *n* — must set it from a hash of the document
 * it built the scene from.
 *
 * A scene without one has nothing stable to key on: class names collide and
 * array position changes when a scene is added. Those scenes simply measure
 * every time, which is correct rather than merely safe — a wrong key would serve
 * one scene's timings for another.
 */
function storeKeyOf(scene: Scene): string | undefined {
    return scene.precompKey || undefined;
}

/**
 * Which host-store keys are trustworthy for a given lookup.
 *
 * `"any"` is the normal path. `"content-only"` is {@link Precomp.replaceScene}'s:
 * a scene has just been edited, so a key that names the scene's *slot* rather
 * than its content now points at the pre-edit measurement and must be refused.
 *
 * Both lookups now consult the same content key, because `Scene.precompKey` is
 * the content itself: a changed scene *is* a changed key, so a hit can only be
 * the right pass. The distinction is kept because it is a real one — a host that
 * later adds a slot-shaped key must refuse it here — and because the replace path
 * documents its own requirement rather than inheriting it silently.
 */
type StoreLookup = "any" | "content-only";

/** The key that names a scene's content, or nothing if the host didn't set one. */
function contentKeyOf(scene: Scene): string | undefined {
    return scene.precompKey || undefined;
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
 * Frames a scene runs for, from the duration it declares.
 *
 * Rounded up, so a duration that does not land on a frame boundary still gets
 * its last, partial frame drawn rather than being truncated away. Floored at one:
 * a zero-duration scene — a still — is still a scene, and measuring it as no
 * frames would drop it from the timeline entirely. A duration that is not a real
 * number is treated as a still for the same reason: one frame beats none.
 */
function sceneFrameCount(scene: Scene, fps: number): number {
    const duration = scene.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration)) return 1;
    return Math.max(1, Math.ceil(duration * fps));
}

/**
 * Walk the scene's live node tree and extend each node's lifespan to cover
 * `[from, to]`, keyed by structural path (see {@link nodePath}). A node's
 * lifespan starts the first frame its slot appears and ends the last frame it is
 * still present, so nodes added or removed mid-scene get a range narrower than
 * the scene itself. The scene root (path "") is included so its own bar spans
 * the whole scene.
 *
 * A range rather than a single frame because a boundary-sampled pass observes
 * the tree twice per interval and calls this out of frame order: `end` is taken
 * as the later of what is already recorded and what is being claimed, so the two
 * observations of one interval compose whichever arrives first. The frame-by-frame
 * caller passes the same number twice and gets the old behaviour exactly.
 */
function recordLifespans(node: Node, path: string, from: number, to: number, out: Map<string, NodeLifespan>): void {
    const existing = out.get(path);
    if (existing) {
        existing.endFrame = Math.max(existing.endFrame, to);
    } else {
        out.set(path, { startFrame: from, endFrame: to });
    }
    // The authored list, so a `Canvas3D`'s meshes get lifespans of their own and
    // its HUD children keep the indices every other path walk gives them — see
    // {@link Node._allChildren}.
    const children = node._allChildren;
    for (let i = 0; i < children.length; i++) {
        recordLifespans(children[i], nodePath(path, i), from, to, out);
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
