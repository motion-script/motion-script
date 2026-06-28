import { Size2D } from "@/attributes/layout/size";
import { Random } from "@/util/random";

/**
 * The determinism + scene-binding machinery a {@link Scene} runs its generator
 * against. One `BuildStage` is created per build pass and re-bound to each scene
 * in turn (see {@link bindScene}); the scene-authoring surface (`add`/`set`/
 * sounds/`to`/camera/paint commands) is supplied by the bound {@link Scene}
 * itself, and the precise author-facing type is the `Stage` alias in
 * `@/nodes` (a `BuildStage` merged with the scene's authoring methods).
 *
 * `@/render` must not import `@/nodes` (that would be circular), so `BuildStage`
 * is generic over its bound scene type `S` rather than importing `Scene`. The
 * runtime constructs `new BuildStage<Scene>(...)`; the `S` flows back out via
 * {@link scene} so the merged `Stage` type stays fully typed.
 */
export class BuildStage<S = unknown> {
    /** Canvas dimensions in pixels. */
    readonly viewport: Size2D;

    /** Target frames-per-second of the composition. */
    readonly fps: number;

    /** The scene this stage is currently bound to (see {@link bindScene}). */
    private _scene: S | null = null;

    constructor(viewport: Size2D, fps: number) {
        this.viewport = viewport;
        this.fps = fps;
    }

    // ─── Scene binding ────────────────────────────────────────────────────────

    /**
     * Bind the scene whose generator is about to run, so its authoring methods
     * are reachable for the duration of the build. The runtime calls this before
     * driving each scene's generator; one stage is reused across all scenes in a
     * pass, re-bound per scene.
     */
    bindScene(scene: S | null): void {
        this._scene = scene;
    }

    /**
     * The scene currently bound to this stage. The author-facing `Stage` type
     * merges the bound scene's authoring methods onto the stage, so generators
     * call `stage.add(...)`/`stage.zoomTo(...)` directly; internally those resolve
     * through here.
     */
    protected get scene(): S {
        if (!this._scene) {
            throw new Error("Stage has no bound scene — authoring methods are only available inside a scene generator.");
        }
        return this._scene;
    }

    // ─── Determinism ──────────────────────────────────────────────────────────

    /**
     * Get a seeded {@link Random} source for this build.
     *
     *   const random = stage.random("sparkle");
     *   const xs = random.floatArray(40, -100, 100);
     *   const drift = random.noise(t, 6);
     *
     * The seed lives on the returned source, not on the stage, so determinism is
     * scoped per source: several `random(...)` calls with distinct seeds give
     * independent reproducible streams. A string seed is djb2-hashed; omit the
     * seed to get a stable default (a wall-clock value fixed when this stage was
     * constructed) so cold scenes still vary without an explicit seed.
     *
     * Sources are cached by seed for the life of the stage and rewound by
     * {@link reset} before each timeline replay — so a scene that re-runs its
     * generator (scrub, precomp, HMR) draws the identical sequence every pass,
     * whether or not it named a seed.
     */
    random(seed: string | number = this._defaultSeed): Random {
        let source = this._sources.get(seed);
        if (!source) {
            source = new Random(seed);
            this._sources.set(seed, source);
        }
        return source;
    }

    // Default seed: the wall-clock time at construction, so a `stage.random()`
    // with no explicit seed still varies between cold runs but stays stable
    // across replays of THIS stage (reset() rewinds to it, not to a fresh time).
    private readonly _defaultSeed: number = Date.now();

    /** Every {@link Random} handed out this pass, keyed by seed, so {@link reset}
     *  can rewind them all to the start of their sequences. */
    private _sources: Map<string | number, Random> = new Map();

    /**
     * Rewind all stateful generators so the next replay is identical to the
     * first. Called by the runtime before each `scene.build(...)`.
     *
     * Each cached {@link Random} is reset to its seed (rather than dropped) so a
     * generator that re-calls `random(seed)` on replay gets back the same source
     * at the head of its sequence — preserving determinism even for the
     * unseeded default source.
     */
    reset() {
        for (const source of this._sources.values()) source.reset();
    }
}
