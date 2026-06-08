import { describe, it, expect } from 'vitest';
import { FX, resolveChainEffects } from '@/attributes/shape/effects/chain';

describe('FX builders', () => {
    it('blur produces a single blur effect', () => {
        expect([...FX.blur(4)]).toEqual([{ type: 'blur', radius: 4 }]);
    });

    it('backgroundBlur produces a single backgroundBlur effect', () => {
        expect([...FX.backgroundBlur(12)]).toEqual([{ type: 'backgroundBlur', radius: 12 }]);
    });

    it('pixelate uses the same size on both axes', () => {
        expect([...FX.pixelate(0.25)]).toEqual([
            { type: 'pixelate', horizontalBlocks: 0.25, verticalBlocks: 0.25 },
        ]);
    });

    it('grayscale produces a grayscale effect', () => {
        expect([...FX.grayscale(0.5)]).toEqual([{ type: 'grayscale', amount: 0.5 }]);
    });

    it('bulgePinch defaults radius and center', () => {
        expect([...FX.bulgePinch(0.6)]).toEqual([
            { type: 'bulgePinch', strength: 0.6, radius: 1, center: { x: 0.5, y: 0.5 } },
        ]);
    });

    it('bulgePinch accepts explicit radius and center', () => {
        expect([...FX.bulgePinch(-0.4, 0.3, { x: 0.25, y: 0.75 })]).toEqual([
            { type: 'bulgePinch', strength: -0.4, radius: 0.3, center: { x: 0.25, y: 0.75 } },
        ]);
    });
});

describe('EffectChain', () => {
    it('appends effects in order while staying immutable', () => {
        const base = FX.blur(4);
        const extended = base.grayscale(1);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'grayscale', amount: 1 });
    });

    it('is iterable for spreading into an array', () => {
        const arr = [...FX.blur(2).pixelate(0.1)];
        expect(arr).toHaveLength(2);
        expect(arr[0]).toEqual({ type: 'blur', radius: 2 });
    });

    it('toJSON returns the raw effect list', () => {
        const chain = FX.blur(8);
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('resolveChainEffects', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainEffects(undefined)).toEqual([]);
    });

    it('unwraps an EffectChain to its list', () => {
        const chain = FX.blur(3);
        expect(resolveChainEffects(chain)).toBe(chain.list);
    });

    it('passes an array through unchanged', () => {
        const arr = [{ type: 'blur', radius: 1 } as const];
        expect(resolveChainEffects(arr)).toBe(arr);
    });

    it('wraps a single effect into an array', () => {
        expect(resolveChainEffects({ type: 'blur', radius: 5 })).toEqual([{ type: 'blur', radius: 5 }]);
    });
});
