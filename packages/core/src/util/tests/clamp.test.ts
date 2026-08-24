import { describe, it, expect } from 'vitest';
import { clamp, clamp01 } from '@/util/clamp';

describe('clamp', () => {
    it('returns the value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to the lower bound', () => {
        expect(clamp(-3, 0, 10)).toBe(0);
    });

    it('clamps to the upper bound', () => {
        expect(clamp(42, 0, 10)).toBe(10);
    });

    it('returns the bound exactly when value equals it', () => {
        expect(clamp(0, 0, 10)).toBe(0);
        expect(clamp(10, 0, 10)).toBe(10);
    });

    it('works with negative ranges', () => {
        expect(clamp(-5, -10, -1)).toBe(-5);
        expect(clamp(0, -10, -1)).toBe(-1);
    });
});

describe('clamp01', () => {
    it('passes through values inside [0,1]', () => {
        expect(clamp01(0.5)).toBe(0.5);
    });

    it('clamps below 0 to 0 and above 1 to 1', () => {
        expect(clamp01(-2)).toBe(0);
        expect(clamp01(3)).toBe(1);
    });
});
