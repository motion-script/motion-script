import { describe, it, expect } from 'vitest';
import { lerpNumber } from '@/tween/lerp';

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
