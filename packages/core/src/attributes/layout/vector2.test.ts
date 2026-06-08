import { describe, it, expect } from 'vitest';
import { lerpVector2 } from '@/attributes/layout/vector2';

describe('lerpVector2', () => {
    it('returns from at t=0', () => {
        expect(lerpVector2({ x: 1, y: 2 }, { x: 10, y: 20 }, 0)).toEqual({ x: 1, y: 2 });
    });

    it('returns to at t=1', () => {
        expect(lerpVector2({ x: 1, y: 2 }, { x: 10, y: 20 }, 1)).toEqual({ x: 10, y: 20 });
    });

    it('interpolates each axis independently at the midpoint', () => {
        expect(lerpVector2({ x: 0, y: 0 }, { x: 10, y: 4 }, 0.5)).toEqual({ x: 5, y: 2 });
    });

    it('handles negative coordinates', () => {
        expect(lerpVector2({ x: -10, y: 10 }, { x: 10, y: -10 }, 0.5)).toEqual({ x: 0, y: 0 });
    });

    it('returns a fresh object rather than mutating an input', () => {
        const from = { x: 0, y: 0 };
        const result = lerpVector2(from, { x: 2, y: 2 }, 0.5);
        expect(result).not.toBe(from);
        expect(from).toEqual({ x: 0, y: 0 });
    });
});
