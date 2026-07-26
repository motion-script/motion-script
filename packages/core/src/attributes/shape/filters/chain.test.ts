import { describe, it, expect } from 'vitest';
import { ImageFilters, resolveChainFilters } from '@/attributes/shape/filters/chain';

describe('ImageFilters builders', () => {
    it('blur stores its radius under the shared `radius` name', () => {
        expect([...ImageFilters.blur(6)]).toEqual([{ type: 'blur', radius: 6 }]);
    });

    it('alpha and exposure carry their amount', () => {
        expect([...ImageFilters.alpha(0.5)]).toEqual([{ type: 'alpha', amount: 0.5 }]);
        expect([...ImageFilters.exposure(2)]).toEqual([{ type: 'exposure', amount: 2 }]);
    });

    it('scalar shorthand matches the options form', () => {
        expect([...ImageFilters.blur(6)]).toEqual([...ImageFilters.blur({ radius: 6 })]);
        expect([...ImageFilters.grayscale(1)]).toEqual([...ImageFilters.grayscale({ amount: 1 })]);
    });

    it('colorAdjustment spreads settings alongside the type', () => {
        expect([...ImageFilters.colorAdjustment({ contrast: 1.2, saturation: 0.8 })]).toEqual([
            { type: 'colorAdjustment', contrast: 1.2, saturation: 0.8 },
        ]);
    });

    it('colorMatrix accepts a bare matrix array or an options object', () => {
        const matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
        expect([...ImageFilters.colorMatrix(matrix)]).toEqual([{ type: 'colorMatrix', matrix }]);
        expect([...ImageFilters.colorMatrix({ matrix })]).toEqual([{ type: 'colorMatrix', matrix }]);
    });

    it('curves carries points and optional channel', () => {
        expect([...ImageFilters.curves({ points: [[0, 0], [1, 1]], channel: 'r' })]).toEqual([
            { type: 'curves', points: [[0, 0], [1, 1]], channel: 'r' },
        ]);
    });
});

describe('FilterChain', () => {
    it('chains filters immutably in order', () => {
        const base = ImageFilters.blur(4);
        const extended = base.grayscale(0.5);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'grayscale', amount: 0.5 });
    });

    it('toJSON returns the raw list', () => {
        const chain = ImageFilters.alpha(0.3);
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('resolveChainFilters', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainFilters(undefined)).toEqual([]);
    });

    it('unwraps a FilterChain', () => {
        const chain = ImageFilters.blur(2);
        expect(resolveChainFilters(chain)).toBe(chain.list);
    });

    it('passes arrays through and wraps single filters', () => {
        const arr = [{ type: 'blur', radius: 1 } as const];
        expect(resolveChainFilters(arr)).toBe(arr);
        expect(resolveChainFilters({ type: 'alpha', amount: 1 })).toEqual([{ type: 'alpha', amount: 1 }]);
    });
});
