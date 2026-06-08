import { describe, it, expect } from 'vitest';
import { lerpColor } from '@/attributes/shape/fill/lerp';

describe('lerpColor', () => {
    it('returns the from color at t=0', () => {
        expect(lerpColor([0, 0, 0, 1], [1, 1, 1, 1], 0)).toEqual([0, 0, 0, 1]);
    });

    it('returns the to color at t=1', () => {
        expect(lerpColor([0, 0, 0, 1], [1, 1, 1, 1], 1)).toEqual([1, 1, 1, 1]);
    });

    it('interpolates every channel including alpha', () => {
        expect(lerpColor([0, 0, 0, 0], [1, 0.5, 0.2, 1], 0.5)).toEqual([0.5, 0.25, 0.1, 0.5]);
    });

    it('interpolates red→blue at the midpoint', () => {
        const mid = lerpColor([1, 0, 0, 1], [0, 0, 1, 1], 0.5);
        expect(mid).toEqual([0.5, 0, 0.5, 1]);
    });
});
