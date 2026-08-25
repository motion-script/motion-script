import { describe, it, expect } from 'vitest';
import { lerpNumber, lerpPerspective } from '@/tween/lerp';

describe('lerpNumber', () => {
    it('returns from at t=0 and to at t=1', () => {
        expect(lerpNumber(10, 20, 0)).toBe(10);
        expect(lerpNumber(10, 20, 1)).toBe(20);
    });

    it('interpolates the midpoint at t=0.5', () => {
        expect(lerpNumber(0, 10, 0.5)).toBe(5);
    });

    it('works with descending ranges', () => {
        expect(lerpNumber(20, 0, 0.25)).toBe(15);
    });

    it('extrapolates outside [0,1] (no clamping)', () => {
        expect(lerpNumber(0, 10, 2)).toBe(20);
        expect(lerpNumber(0, 10, -1)).toBe(-10);
    });

    it('handles negative endpoints', () => {
        expect(lerpNumber(-10, 10, 0.5)).toBe(0);
    });
});

describe('lerpPerspective', () => {
    it('returns from at t=0 and to at t=1', () => {
        expect(lerpPerspective(0, 800, 0)).toBe(0);
        expect(lerpPerspective(0, 800, 1)).toBe(800);
        expect(lerpPerspective(800, 0, 0)).toBe(800);
        expect(lerpPerspective(800, 0, 1)).toBe(0);
    });

    it('interpolates two finite distances at the reciprocal midpoint, not the arithmetic one', () => {
        // Halfway between 1/400 and 1/800 is 3/1600, i.e. 1600/3.
        expect(lerpPerspective(400, 800, 0.5)).toBeCloseTo(1600 / 3);
    });

    it('never overshoots the target reciprocal when animating on from "off"', () => {
        // A plain lerp of the raw px value would pass through perspective=8 at
        // t=0.01 here, whose 1/8 reciprocal is ~156x stronger than the 1/800
        // target — the "flash" this function exists to avoid. The reciprocal
        // itself must stay monotonic and bounded by the two endpoints instead.
        const target = 1 / 800;
        for (const t of [0, 0.01, 0.1, 0.5, 0.9, 0.99, 1]) {
            const value = lerpPerspective(0, 800, t);
            const inv = value !== 0 ? 1 / value : 0;
            expect(inv).toBeGreaterThanOrEqual(-1e-9);
            expect(inv).toBeLessThanOrEqual(target + 1e-9);
        }
    });

    it('is monotonic between two finite endpoints', () => {
        const values = [0, 0.25, 0.5, 0.75, 1].map((t) => lerpPerspective(300, 1500, t));
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
    });
});
