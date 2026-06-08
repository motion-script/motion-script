import { describe, it, expect } from 'vitest';
import { prepareNumericTween } from '@/tween/prepare';

describe('prepareNumericTween', () => {
    it('snapshots the start values and interpolates toward the target', () => {
        const target = { x: 0, y: 100 };
        const apply = prepareNumericTween(target, { x: 10, y: 0 });

        apply(0.5);
        expect(target.x).toBe(5);
        expect(target.y).toBe(50);
    });

    it('writes the exact target at t=1', () => {
        const target = { x: 0 };
        const apply = prepareNumericTween(target, { x: 42 });
        apply(1);
        expect(target.x).toBe(42);
    });

    it('leaves the start value at t=0', () => {
        const target = { x: 7 };
        const apply = prepareNumericTween(target, { x: 100 });
        apply(0);
        expect(target.x).toBe(7);
    });

    it('captures the start value at preparation time, not call time', () => {
        const target = { x: 0 };
        const apply = prepareNumericTween(target, { x: 10 });
        // Mutating after prepare must not change the interpolation baseline.
        target.x = 1000;
        apply(0.5);
        expect(target.x).toBe(5);
    });

    it('only touches keys present in the target spec', () => {
        const target = { x: 0, y: 0 };
        const apply = prepareNumericTween(target, { x: 10 });
        apply(1);
        expect(target.y).toBe(0);
    });

    it('ignores undefined target values', () => {
        const target = { x: 5 };
        const apply = prepareNumericTween(target, { x: undefined });
        apply(1);
        expect(target.x).toBe(5);
    });
});
