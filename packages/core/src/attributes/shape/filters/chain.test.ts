import { describe, it, expect } from 'vitest';
import { Adjustments, VideoAdjustments, AdjustmentChain, resolveChainAdjustments } from '@/attributes/shape/filters/chain';
import { Effects } from '@/attributes/shape/effects/chain';
import { effectTypes } from '@/attributes/shape/effects/registry';

/**
 * The effects deliberately kept off a media fill. Mirrors `NonFilterEffect` in
 * `filters/union.ts` — that one is a type, so this is the runtime half of the
 * same statement and the sweep below is what keeps them honest.
 */
const NOT_FILTERS = ['magnify', 'glass', 'motionBlur', 'trails', 'outline'];

describe('Adjustments builders', () => {
    it('blur stores its radius under the shared `radius` name', () => {
        expect([...Adjustments.blur(6)]).toEqual([{ type: 'blur', radius: 6 }]);
    });

    it('alpha and exposure carry their amount', () => {
        expect([...Adjustments.alpha(0.5)]).toEqual([{ type: 'alpha', amount: 0.5 }]);
        expect([...Adjustments.exposure(2)]).toEqual([{ type: 'exposure', amount: 2 }]);
    });

    it('scalar shorthand matches the options form', () => {
        expect([...Adjustments.blur(6)]).toEqual([...Adjustments.blur({ radius: 6 })]);
        expect([...Adjustments.grayscale(1)]).toEqual([...Adjustments.grayscale({ amount: 1 })]);
    });

    it('colorAdjustment spreads settings alongside the type', () => {
        expect([...Adjustments.colorAdjustment({ contrast: 1.2, saturation: 0.8 })]).toEqual([
            { type: 'colorAdjustment', contrast: 1.2, saturation: 0.8 },
        ]);
    });

    it('colorMatrix accepts a bare matrix array or an options object', () => {
        const matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
        expect([...Adjustments.colorMatrix(matrix)]).toEqual([{ type: 'colorMatrix', matrix }]);
        expect([...Adjustments.colorMatrix({ matrix })]).toEqual([{ type: 'colorMatrix', matrix }]);
    });

    it('curves carries points and optional channel', () => {
        expect([...Adjustments.curves({ points: [[0, 0], [1, 1]], channel: 'r' })]).toEqual([
            { type: 'curves', points: [[0, 0], [1, 1]], channel: 'r' },
        ]);
    });
});

describe('VideoAdjustmentChain', () => {
    it('chains filters immutably in order', () => {
        const base = Adjustments.blur(4);
        const extended = base.grayscale(0.5);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'grayscale', amount: 0.5 });
    });

    it('toJSON returns the raw list', () => {
        const chain = Adjustments.alpha(0.3);
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('effects as media filters', () => {
    it('gives every filterable effect a builder of the same name', () => {
        const missing = effectTypes()
            .filter((type) => !NOT_FILTERS.includes(type))
            .filter((type) => typeof (Adjustments as unknown as Record<string, unknown>)[type] !== 'function');
        expect(missing).toEqual([]);
    });

    it('keeps the excluded effects off an image filter chain', () => {
        for (const type of NOT_FILTERS) {
            expect((Adjustments as unknown as Record<string, unknown>)[type]).toBeUndefined();
        }
    });

    it('builds the same effect the scene builder does', () => {
        expect([...Adjustments.oilPaint(4)]).toEqual([...Effects.oilPaint(4)]);
        expect([...Adjustments.dither({ levels: 3, matrix: 8 })])
            .toEqual([...Effects.dither({ levels: 3, matrix: 8 })]);
    });

    it('drops `mode` — a fill has no backdrop to point a filter at', () => {
        // The chain builder can't be handed one, and the effect builder only
        // writes the key when it is given: the produced filter has no `mode`.
        expect([...Adjustments.posterize(4)][0]).not.toHaveProperty('mode');
    });

    it('interleaves with the filter-only builders in author order', () => {
        expect([...Adjustments.grayscale(1).oilPaint(3).blur(2)].map((f) => f.type))
            .toEqual(['grayscale', 'oilPaint', 'blur']);
    });
});

describe('Adjustments / VideoAdjustments entry points', () => {
    it('are empty chains, so a builder call starts a fresh one', () => {
        expect(Adjustments.list).toEqual([]);
        Adjustments.blur(1).grayscale(1);
        expect(Adjustments.list).toEqual([]);
    });

    it('keeps video-only filters off the image entry point', () => {
        expect((Adjustments as unknown as Record<string, unknown>).posterizeTime).toBeUndefined();
        expect((Adjustments as unknown as Record<string, unknown>).echo).toBeUndefined();
    });

    it('keeps the video-only builders reachable after an inherited one', () => {
        // `grayscale` is declared on the base class; a plain `return new
        // AdjustmentChain(...)` there would strand `posterizeTime`.
        expect([...VideoAdjustments.grayscale(1).posterizeTime(6)].map((f) => f.type))
            .toEqual(['grayscale', 'posterizeTime']);
    });
});

describe('resolveChainAdjustments', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainAdjustments(undefined)).toEqual([]);
    });

    it('unwraps a VideoAdjustmentChain', () => {
        const chain = Adjustments.blur(2);
        expect(chain).toBeInstanceOf(AdjustmentChain);
        expect(resolveChainAdjustments(chain)).toBe(chain.list);
    });

    it('passes arrays through and wraps single filters', () => {
        const arr = [{ type: 'blur', radius: 1 } as const];
        expect(resolveChainAdjustments(arr)).toBe(arr);
        expect(resolveChainAdjustments({ type: 'alpha', amount: 1 })).toEqual([{ type: 'alpha', amount: 1 }]);
    });
});
