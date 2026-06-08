import { Size2D } from "@/attributes/layout/size";
import { SeedGenerator } from "@/util/random";

/**
 * Provides per-frame context during the build/evaluation pass of a scene.
 *
 * Each scene node receives a `BuildStage` when its properties are being
 * evaluated for a given frame. It exposes:
 * - The canvas `viewport` dimensions and the target `fps`.
 * - A seeded pseudo-random number generator (`random`) for reproducible
 *   randomness across timeline replays.
 * - A smooth value-noise function (`noise`) built on the same seed, useful
 *   for organic motion without discontinuities.
 *
 * `reset()` is called before each timeline replay so that every run produces
 * identical results for the same seed.
 */
export class BuildStage {
    /** Canvas dimensions in pixels. */
    readonly viewport: Size2D;

    /** Target frames-per-second of the composition. */
    readonly fps: number;

    constructor(viewport: Size2D, fps: number) {
        this.viewport = viewport;
        this.fps = fps;
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
