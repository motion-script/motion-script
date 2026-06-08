/**
 * Deterministic pseudo-random number generator based on the mulberry32 algorithm.
 * Produces the same sequence for the same seed, making animations reproducible.
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
