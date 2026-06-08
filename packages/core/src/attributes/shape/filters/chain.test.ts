import { describe, it, expect } from 'vitest';
import { MX, resolveChainFilters } from '@/attributes/shape/filters/chain';

describe('MX builders', () => {
    it('blur stores radius under value', () => {
        expect([...MX.blur(6)]).toEqual([{ type: 'blur', value: 6 }]);
    });

    it('alpha and exposure carry their value', () => {
        expect([...MX.alpha(0.5)]).toEqual([{ type: 'alpha', value: 0.5 }]);
        expect([...MX.exposure(2)]).toEqual([{ type: 'exposure', value: 2 }]);
    });

    it('colorAdjustment spreads settings alongside the type', () => {
        expect([...MX.colorAdjustment({ contrast: 1.2, saturation: 0.8 })]).toEqual([
            { type: 'colorAdjustment', contrast: 1.2, saturation: 0.8 },
        ]);
    });

    it('curves carries points and optional channel', () => {
        expect([...MX.curves([[0, 0], [1, 1]], 'r')]).toEqual([
            { type: 'curves', points: [[0, 0], [1, 1]], channel: 'r' },
        ]);
    });
});

describe('FilterChain', () => {
    it('chains filters immutably in order', () => {
        const base = MX.blur(4);
        const extended = base.grayscale(0.5);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'grayscale', value: 0.5 });
    });

    it('toJSON returns the raw list', () => {
        const chain = MX.alpha(0.3);
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('resolveChainFilters', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainFilters(undefined)).toEqual([]);
    });

    it('unwraps a FilterChain', () => {
        const chain = MX.blur(2);
        expect(resolveChainFilters(chain)).toBe(chain.list);
    });

    it('passes arrays through and wraps single filters', () => {
        const arr = [{ type: 'blur', value: 1 } as const];
        expect(resolveChainFilters(arr)).toBe(arr);
        expect(resolveChainFilters({ type: 'alpha', value: 1 })).toEqual([{ type: 'alpha', value: 1 }]);
    });
});
