import { Size2D } from "@/attributes/layout/size";
import { SeedGenerator } from "@/util/random";
import { FrameGenerator } from "@/tween/generator";

/**
 * The scene-authoring surface a {@link Scene} binds onto its {@link BuildStage}
 * for the duration of a build pass. Kept as a structural interface (rather than
 * importing `Scene`/`Node`/`Sound`) so `@/render` doesn't depend on `@/nodes`,
 * which would be circular. The concrete types are supplied by the Scene that
 * binds it; callers in scene generators get the real signatures via the
 * `BuildStage` re-declarations below.
 */
export interface SceneContext {
    add(node: unknown): void;
    set(props: Record<string, unknown>): void;
    startSound(src: unknown, opts?: unknown): unknown;
    stopSound(sound: unknown): void;
    playSound(src: unknown, opts?: unknown): FrameGenerator;
    readonly clock: unknown;
    readonly assets: unknown;
}

/**
 * Per-scene authoring + evaluation context handed to a scene's generator.
 *
 * A scene generator (`createScene(function* (stage) { … })`) receives a
 * `BuildStage`. It exposes two things:
 *
 * - **Authoring** — `add`, `set`, `startSound`/`playSound`/`stopSound`, `clock`,
 *   `assets`: these forward to the scene currently being built (bound via
 *   {@link bindScene} by the runtime before driving the generator).
 * - **Determinism** — the canvas `viewport`, target `fps`, a seeded `random`,
 *   and value `noise`, so randomness is reproducible across timeline replays.
 *
 * `reset()` is called before each timeline replay so every run produces
 * identical results for the same seed.
 */
export class BuildStage {
    /** Canvas dimensions in pixels. */
    readonly viewport: Size2D;

    /** Target frames-per-second of the composition. */
    readonly fps: number;

    /** The scene this stage is currently bound to (see {@link bindScene}). */
    private _scene: SceneContext | null = null;

    constructor(viewport: Size2D, fps: number) {
        this.viewport = viewport;
        this.fps = fps;
    }

    // ─── Scene binding ────────────────────────────────────────────────────────

    /**
     * Bind the scene whose generator is about to run, so the authoring methods
     * (`add`, `set`, sounds, `clock`, `assets`) forward to it. The runtime calls
     * this before driving each scene's generator; one stage is reused across all
     * scenes in a pass, re-bound per scene.
     */
    bindScene(scene: SceneContext | null): void {
        this._scene = scene;
    }

    private get scene(): SceneContext {
        if (!this._scene) {
            throw new Error("BuildStage has no bound scene — add()/set()/sounds are only available inside a scene generator.");
        }
        return this._scene;
    }

    // ─── Authoring surface (forwards to the bound scene) ──────────────────────

    /** Add a node (or array of nodes) to the scene's root container. */
    add(node: unknown): void {
        this.scene.add(node);
    }

    /** Set one or more reactive props on the scene's root container. */
    set(props: Record<string, unknown>): void {
        this.scene.set(props);
    }

    /** Start a non-blocking sound on the scene's audio timeline. */
    startSound(src: unknown, opts?: unknown): unknown {
        return this.scene.startSound(src, opts);
    }

    /** Stop a sound started via {@link startSound}. */
    stopSound(sound: unknown): void {
        this.scene.stopSound(sound);
    }

    /** Play a sound, blocking the generator for the clip's duration. */
    playSound(src: unknown, opts?: unknown): FrameGenerator {
        return this.scene.playSound(src, opts);
    }

    /** The scene's clock (scene-relative time). */
    get clock(): unknown {
        return this.scene.clock;
    }

    /** The asset catalog bound to the scene. */
    get assets(): unknown {
        return this.scene.assets;
    }

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
