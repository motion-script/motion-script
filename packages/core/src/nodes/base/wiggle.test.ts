import { describe, it, expect, vi } from 'vitest';
import { Node2D } from '@/nodes/base/node2d';
import { Rect } from '@/nodes/geometry/rect-node';

/** A bare leaf node usable directly (Node2D's constructor accepts Node2DProps). */
class Tile extends Node2D {
    constructor(props?: any) {
        super(props ?? {});
    }
}

/** Drive a Command (or any Iterable<void>) to completion with a fixed frame
 *  delta, collecting the value of `prop` after each resume. */
function driveCollect(n: Node2D, command: Iterable<void>, dt: number, prop: string): number[] {
    const gen = command[Symbol.iterator]() as Iterator<void, void, number>;
    const seen: number[] = [];
    let res = gen.next();               // prime to first yield
    seen.push((n as any)[prop]);
    while (!res.done) {
        res = gen.next(dt);
        seen.push((n as any)[prop]);
    }
    return seen;
}

/** Drive a Command (or any Iterable<void>) to completion, ignoring intermediate values. */
function drive(command: Iterable<void>, dt: number): void {
    const gen = command[Symbol.iterator]() as Iterator<void, void, number>;
    let res = gen.next();
    while (!res.done) res = gen.next(dt);
}

describe('Node2D.wiggle', () => {
    it('settles back exactly on the base value when it finishes', () => {
        const n = new Tile({ x: 40 });
        const vals = driveCollect(n, n.wiggle({ x: 10 }, 1), 0.1, 'x');
        expect(vals[vals.length - 1]).toBe(40);
        expect(n.x).toBe(40);
    });

    it('rides on top of the current value (not zero-centred)', () => {
        const n = new Tile({ x: 100 });
        // Every intermediate offset stays within the amplitude band around 100.
        const vals = driveCollect(n, n.wiggle({ x: 5 }, 1), 0.05, 'x');
        for (const v of vals) {
            expect(v).toBeGreaterThanOrEqual(100 - 5);
            expect(v).toBeLessThanOrEqual(100 + 5);
        }
    });

    it('actually moves the prop during the wiggle', () => {
        const n = new Tile({ y: 0 });
        const vals = driveCollect(n, n.wiggle({ y: 20 }, 1, { frequency: 6 }), 0.05, 'y');
        // At least one intermediate frame departed from the base.
        expect(vals.some((v) => Math.abs(v) > 1e-3)).toBe(true);
    });

    it('wiggles several props at once and settles them all back', () => {
        const n = new Tile({ x: 10, y: 20, rotation: 30 });
        const gen = n.wiggle({ x: 5, y: 5, rotation: 5 }, 1, { frequency: 5 })[Symbol.iterator]();
        let res = gen.next();
        const xs: number[] = [n.x];
        const ys: number[] = [n.y];
        const rs: number[] = [n.rotation];
        while (!res.done) {
            res = gen.next(0.1);
            xs.push(n.x); ys.push(n.y); rs.push(n.rotation);
        }
        expect(xs.some((v) => Math.abs(v - 10) > 1e-3)).toBe(true);
        expect(ys.some((v) => Math.abs(v - 20) > 1e-3)).toBe(true);
        expect(rs.some((v) => Math.abs(v - 30) > 1e-3)).toBe(true);
        expect(n.x).toBe(10);
        expect(n.y).toBe(20);
        expect(n.rotation).toBe(30);
    });

    it('decorrelates same-length prop names (x vs y move independently)', () => {
        // Regression: a `key.length` phase gave x and y the identical offset, so
        // { x, y } wiggled diagonally instead of in all directions.
        const n = new Tile({ x: 0, y: 0 });
        const gen = n.wiggle({ x: 10, y: 10 }, 2, { frequency: 5 })[Symbol.iterator]();
        let res = gen.next();
        const xs: number[] = [n.x];
        const ys: number[] = [n.y];
        while (!res.done) {
            res = gen.next(0.05);
            xs.push(n.x); ys.push(n.y);
        }
        expect(xs).not.toEqual(ys);
        const mid = Math.floor(xs.length / 2);
        expect(Math.abs(xs[mid] - ys[mid])).toBeGreaterThan(0.5);
    });

    // ---- call-wide options bag (2B) ---------------------------------------

    it('applies the frequency option across the props in the call', () => {
        // A frequency in the options bag must reach the noise sampling: two runs
        // with different frequencies produce different motion.
        const slow = new Tile({ x: 0, seed: 'freq' });
        const fast = new Tile({ x: 0, seed: 'freq' });
        const vs = driveCollect(slow, slow.wiggle({ x: 10 }, 2, { frequency: 1 }), 0.05, 'x');
        const vf = driveCollect(fast, fast.wiggle({ x: 10 }, 2, { frequency: 12 }), 0.05, 'x');
        expect(vs).not.toEqual(vf);
    });

    it('defaults frequency to 4 when the options bag is omitted', () => {
        const a = new Tile({ x: 0, seed: 'def' });
        const b = new Tile({ x: 0, seed: 'def' });
        const va = driveCollect(a, a.wiggle({ x: 8 }, 1), 0.1, 'x');
        const vb = driveCollect(b, b.wiggle({ x: 8 }, 1, { frequency: 4 }), 0.1, 'x');
        expect(va).toEqual(vb);
    });

    it('settle:0 is a hard cut — no ease-out, offset persists to the last frame', () => {
        // With no settle, the final wiggling frame is generally off-base; only
        // the explicit final assignment lands it back exactly.
        const n = new Tile({ x: 0, seed: 'cut' });
        const gen = n.wiggle({ x: 50 }, 1, { frequency: 6, settle: 0 })[Symbol.iterator]();
        let res = gen.next();
        let lastDuring = n.x;
        while (!res.done) {
            lastDuring = n.x;           // value on the frame before completion
            res = gen.next(0.1);
        }
        // The last mid-run frame kept a real offset (no fade), yet it still
        // finishes exactly on base via the closing assignment.
        expect(Math.abs(lastDuring)).toBeGreaterThan(1e-3);
        expect(n.x).toBe(0);
    });

    // ---- mapped numeric props (1B) ----------------------------------------

    it('wiggles a numeric-stored mapped prop, riding on its resolved value', () => {
        // A prop with a numeric mapper (here: doubles author → stored) stores a
        // plain number, so wiggle rides on the resolved base directly. The offset
        // is not re-mapped (the mapper is one-way), which is the correct
        // behaviour — no double application.
        class Knob extends Node2D {
            constructor(p?: any) { super(p ?? {}); }
        }
        const k = new Knob({ x: 0 });
        (k as any).applyProp('gain', 5, { mapper: (v: number) => v * 2 });
        expect((k as any).gain).toBe(10);        // author 5 mapped → stored 10

        const seen: number[] = [];
        const gen = k.wiggle({ gain: 3 } as any, 1, { frequency: 6 })[Symbol.iterator]();
        let res = gen.next();
        seen.push((k as any).gain);
        while (!res.done) { res = gen.next(0.1); seen.push((k as any).gain); }

        // Rode on the stored base of 10, staying within ±3 of it...
        for (const v of seen) {
            expect(v).toBeGreaterThanOrEqual(10 - 3 - 1e-9);
            expect(v).toBeLessThanOrEqual(10 + 3 + 1e-9);
        }
        expect(seen.some((v) => Math.abs(v - 10) > 1e-3)).toBe(true);
        // ...and settled back exactly on it.
        expect((k as any).gain).toBe(10);
    });

    it('warns and skips an object-valued mapped prop (per-corner cornerRadius)', () => {
        // cornerRadius resolves to a per-corner object, so there is no scalar
        // stored value to offset — wiggle warns and leaves it untouched rather
        // than producing NaN corners.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const r = new Rect({ cornerRadius: 20 });
        drive(r.wiggle({ cornerRadius: 10 } as any, 1, { frequency: 6 }), 0.1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('cornerRadius'));
        expect((r.cornerRadius as any).topLeft).toBe(20);
        warn.mockRestore();
    });

    // ---- determinism ------------------------------------------------------

    it('is deterministic for a given seed', () => {
        const a = new Tile({ x: 0, seed: 'shake' });
        const b = new Tile({ x: 0, seed: 'shake' });
        const va = driveCollect(a, a.wiggle({ x: 10 }, 1, { frequency: 5 }), 0.1, 'x');
        const vb = driveCollect(b, b.wiggle({ x: 10 }, 1, { frequency: 5 }), 0.1, 'x');
        expect(va).toEqual(vb);
    });

    it('different seeds produce different motion', () => {
        const a = new Tile({ x: 0, seed: 'one' });
        const b = new Tile({ x: 0, seed: 'two' });
        const va = driveCollect(a, a.wiggle({ x: 10 }, 1, { frequency: 5 }), 0.1, 'x');
        const vb = driveCollect(b, b.wiggle({ x: 10 }, 1, { frequency: 5 }), 0.1, 'x');
        expect(va).not.toEqual(vb);
    });

    // ---- guards -----------------------------------------------------------

    it('is a no-op generator for an empty / unknown map', () => {
        const n = new Tile({ x: 3 });
        expect(() => drive(n.wiggle({}, 1), 0.1)).not.toThrow();
        // Unknown key has no cell → skipped without a warning.
        expect(() => drive(n.wiggle({ nope: 10 } as any, 1), 0.1)).not.toThrow();
        expect(n.x).toBe(3);
    });

    it('warns and skips a non-numeric prop but still wiggles numeric ones', () => {
        // `width` is a keyof P but holds 'fill' — it must be warned + left alone
        // while x still wiggles and restores.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const n = new Tile({ x: 5, width: 'fill' });
        const vals = driveCollect(n, n.wiggle({ x: 4, width: 10 } as any, 1, { frequency: 5 }), 0.1, 'x');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('width'));
        expect(n.width).toBe('fill');
        expect(vals.some((v) => Math.abs(v - 5) > 1e-3)).toBe(true);
        expect(n.x).toBe(5);
        warn.mockRestore();
    });
});
