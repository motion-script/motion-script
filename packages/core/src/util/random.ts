/**
 * Deterministic pseudo-random number generator based on the mulberry32 algorithm.
 * Produces the same sequence for the same seed, making animations reproducible.
 *
 * This is the low-level engine. Scene authors use the higher-level {@link Random}
 * facade (handed out by `stage.random(seed)`), which wraps a `SeedGenerator` and
 * adds typed draws (`nextFloat`/`nextInt`/`gauss`/arrays) plus seeded `noise`.
 */
export class SeedGenerator {
    private state: number = 0;

    constructor(seed: string | number) {
        this.setSeed(seed);
    }

    /**
     * Resets the generator to a new seed.
     * String seeds are hashed via djb2 into a 32-bit integer.
     */
    setSeed(seed: string | number) {
        this.state = typeof seed === 'string'
            ? seed.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)
            : seed;
    }

    /** Returns the next pseudo-random float in [0, 1). */
    next() {
        this.state |= 0; this.state = this.state + 0x6D2B79F5 | 0;
        var t = Math.imul(this.state ^ this.state >>> 15, 1 | this.state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/** Upper bound of {@link Random.nextInt} / {@link Random.intArray} (2^32). */
const UINT32_RANGE = 4294967296;

/**
 * A seeded random source handed to scene generators by `stage.random(seed)`.
 *
 * Wraps a {@link SeedGenerator} (mulberry32) and exposes the author-facing draw
 * surface. Because the seed lives on the `Random` instance, determinism is
 * scoped per source: two scenes can each `stage.random("name")` and get their
 * own reproducible stream without touching a shared stage-level seed.
 *
 *   const random = stage.random("sparkle");
 *   const xs = random.floatArray(40, -100, 100);   // 40 reproducible offsets
 *   const drift = random.noise(t, 6);              // smooth field over time
 *
 * Two families live here, and they are NOT interchangeable:
 *  - **Independent draws** — `nextFloat`/`nextInt`/`gauss` and their array
 *    forms. Successive calls are uncorrelated; `gauss` only changes the
 *    *distribution* (bell curve vs flat), not the independence.
 *  - **Correlated field** — `noise(t)`. Nearby inputs return nearby values, so
 *    it is the right tool for smooth motion over time/space (drift, shake,
 *    waves). No distribution draw can reproduce that smoothness.
 */
export class Random {
    /** The seed this source rewinds to; reassign via {@link seed} or
     * {@link reset}. Set by {@link adopt} (definitely assigned via the
     * constructor's `adopt` call). */
    private _seed!: string | number;

    /** Numeric form of {@link _seed}, used to mix `noise`'s lattice. Kept in
     * lockstep with `_seed` through {@link adopt}. */
    private numericSeed!: number;

    private readonly gen: SeedGenerator;

    /** A spare gaussian sample from the last Box–Muller pair (see {@link gauss}). */
    private spareGauss: number | null = null;

    constructor(seed: string | number) {
        this.gen = new SeedGenerator(seed);
        this.adopt(seed);
    }

    /** The seed this source rewinds to. Assigning a new value re-anchors the
     * source (same effect as `reset(seed)`): the next draws reproduce the
     * sequence for that seed, and `noise`'s lattice shifts to match. */
    get seed(): string | number {
        return this._seed;
    }
    set seed(seed: string | number) {
        this.adopt(seed);
    }

    /** Numeric form of a seed: string seeds are hashed (the same djb2-style mix
     * the generator uses), numbers pass through. Shared so the constructor, the
     * {@link seed} setter, and {@link reset} all derive `numericSeed` identically. */
    private static toNumeric(seed: string | number): number {
        return typeof seed === 'string'
            ? seed.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)
            : seed;
    }

    /** Take `seed` as the new origin and rewind to it: store it, recompute the
     * `noise` lattice anchor, reset the generator, and drop any spare gauss. The
     * single seed-adoption path behind the constructor, {@link seed}, and a
     * seeded {@link reset}. */
    private adopt(seed: string | number): void {
        this._seed = seed;
        this.numericSeed = Random.toNumeric(seed);
        this.gen.setSeed(seed);
        this.spareGauss = null;
    }

    /**
     * The next pseudo-random float in `[from, to)`. Defaults to `[0, 1)`.
     */
    nextFloat(from: number = 0, to: number = 1): number {
        return this.gen.next() * (to - from) + from;
    }

    /**
     * The next pseudo-random integer in `[from, to)`. Defaults to the full
     * unsigned 32-bit range `[0, 2^32)`.
     */
    nextInt(from: number = 0, to: number = UINT32_RANGE): number {
        return Math.floor(this.gen.next() * (to - from)) + from;
    }

    /** `size` independent floats in `[from, to)`. */
    floatArray(size: number, from: number = 0, to: number = 1): number[] {
        const out = new Array<number>(size);
        for (let i = 0; i < size; i++) out[i] = this.nextFloat(from, to);
        return out;
    }

    /** `size` independent integers in `[from, to)`. */
    intArray(size: number, from: number = 0, to: number = UINT32_RANGE): number[] {
        const out = new Array<number>(size);
        for (let i = 0; i < size; i++) out[i] = this.nextInt(from, to);
        return out;
    }

    /**
     * A normally-distributed sample with the given `mean` and `stdev` (default
     * standard normal). Values cluster near the mean and tail off — useful for
     * natural-looking scatter where most draws stay central with occasional
     * outliers.
     *
     * Uses the polar Box–Muller transform, which yields two independent normals
     * per pair of uniforms; the spare is cached and returned on the next call.
     */
    gauss(mean: number = 0, stdev: number = 1): number {
        if (this.spareGauss !== null) {
            const z = this.spareGauss;
            this.spareGauss = null;
            return mean + stdev * z;
        }
        // Rejection-sample a point in the unit circle, then map to two normals.
        let u: number, v: number, s: number;
        do {
            u = this.gen.next() * 2 - 1;
            v = this.gen.next() * 2 - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);
        const mul = Math.sqrt(-2 * Math.log(s) / s);
        this.spareGauss = v * mul;
        return mean + stdev * (u * mul);
    }

    /**
     * Smooth 1-D value noise in `[0, 1]`.
     *
     * Samples two adjacent lattice points around `time * frequency`, then
     * interpolates with a smoothstep curve (`3t² - 2t³`) to avoid the linear
     * kinks of plain lerp. Unlike {@link nextFloat}/{@link gauss}, nearby
     * `time` inputs return nearby values — this is the correlated field used for
     * organic, continuously varying motion (camera shake, drift, waves).
     *
     * @param time      Sample position (e.g. normalized timeline `[0, 1]`, or a
     *                  spatial index).
     * @param frequency Scales `time` before sampling; higher = faster
     *                  oscillation / more crests across the same span.
     */
    noise(time: number, frequency: number = 1): number {
        const t = time * frequency;
        const i = Math.floor(t);
        const f = t - i;
        // Smoothstep: maps f through 3f²-2f³ to ease in/out between lattice points.
        const curve = f * f * (3 - 2 * f);
        const r1 = this.latticeValue(i);
        const r2 = this.latticeValue(i + 1);
        return r1 + (r2 - r1) * curve;
    }

    /**
     * Rewind this source so the next draws reproduce a sequence from the start.
     *
     * With no argument, rewinds to the current {@link seed} — what authors call to
     * repeat a sequence within a scene. Pass a `seed` to adopt it as the new origin
     * first (equivalent to assigning {@link seed}), so the source both re-seeds and
     * rewinds in one call — e.g. in a node's constructor to give it a distinct
     * reproducible stream.
     */
    reset(seed: string | number = this._seed): void {
        this.adopt(seed);
    }

    /**
     * Deterministic value in `[0, 1)` for a given integer lattice point `x`,
     * mixed with this source's seed via `sin`. Pure in `x` (no generator state),
     * so {@link noise} is stable regardless of how many draws preceded it.
     */
    private latticeValue(x: number): number {
        const h = Math.sin(x + this.numericSeed) * 10000;
        return h - Math.floor(h);
    }
}
