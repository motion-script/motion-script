import { Size2D } from "@/attributes/layout/size";
import { SeedGenerator } from "@/util/random";

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
     * Sets the RNG seed for this stage.
     *
     * Accepts either a numeric seed directly or a string, which is hashed
     * into a 32-bit integer using a djb2-style hash so that human-readable
     * names ("bounce", "sparkle") can be used as stable seeds.
     */
    seed(value: string | number): void {
        this._currentSeed = typeof value === 'string'
            ? value.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)
            : value;
        this.seeder.setSeed(this._currentSeed);
    }

    /**
     * Returns the next pseudo-random number in `[min, max)`.
     *
     * Defaults to `[0, 1)` when called without arguments. The sequence is
     * fully determined by the current seed, so the same seed always produces
     * the same sequence across replays.
     */
    random(min: number = 0, max: number = 1): number {
        return this.seeder.next() * (max - min) + min;
    }

    /**
     * Generates a deterministic float in `[0, 1)` for a given integer lattice
     * point `x`, mixed with the current seed via `sin`.
     */
    private _seededValue(x: number): number {
        const h = Math.sin(x + this._currentSeed) * 10000;
        return h - Math.floor(h);
    }

    /**
     * Smooth 1-D value noise in `[0, 1]`.
     *
     * Samples two adjacent lattice points around `time * frequency`, then
     * interpolates with a smoothstep curve (`3t² - 2t³`) to avoid the
     * linear kinks of plain lerp. Useful for organic, continuously varying
     * motion (camera shake, drift, etc.).
     *
     * @param time      Normalized timeline position, typically in `[0, 1]`.
     * @param frequency Scales `time` before sampling; higher values produce
     *                  faster oscillation.
     */
    noise(time: number, frequency: number = 1): number {
        const t = time * frequency;
        const i = Math.floor(t);
        const f = t - i;
        // Smoothstep: maps f through 3f²-2f³ to ease in/out between lattice points
        const curve = f * f * (3 - 2 * f);
        const r1 = this._seededValue(i);
        const r2 = this._seededValue(i + 1);
        return r1 + (r2 - r1) * curve;
    }

    /** Reseeds the RNG back to `_currentSeed`. Called before each timeline replay. */
    resetSeed(): void {
        this.seeder.setSeed(this._currentSeed);
    }

    // Seed defaults to the wall-clock time at construction so cold scenes
    // still exhibit variety without an explicit seed() call.
    private _currentSeed: number = Date.now();
    private seeder: SeedGenerator = new SeedGenerator(this._currentSeed);

    /** Resets all stateful generators so the next replay is identical to the first. */
    reset() {
        this.resetSeed();
    }
}
