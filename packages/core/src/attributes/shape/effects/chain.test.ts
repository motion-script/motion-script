import { describe, it, expect } from 'vitest';
import { FX, resolveChainEffects } from '@/attributes/shape/effects/chain';

describe('FX builders', () => {
    it('blur produces a single blur effect', () => {
        expect([...FX.blur(4)]).toEqual([{ type: 'blur', radius: 4 }]);
    });

    it('backgroundBlur produces a single backgroundBlur effect', () => {
        expect([...FX.backgroundBlur(12)]).toEqual([{ type: 'backgroundBlur', radius: 12 }]);
    });

    it('directionalBlur produces a direction and blurLength effect', () => {
        expect([...FX.directionalBlur(45, 20)]).toEqual([
            { type: 'directionalBlur', direction: 45, blurLength: 20 },
        ]);
    });

    it('pixelate uses the same size on both axes', () => {
        expect([...FX.pixelate(20)]).toEqual([
            { type: 'pixelate', horizontalBlocks: 20, verticalBlocks: 20 },
        ]);
    });

    it('grayscale produces a grayscale effect', () => {
        expect([...FX.grayscale(0.5)]).toEqual([{ type: 'grayscale', amount: 0.5 }]);
    });

    it('bulge produces a strength-only effect', () => {
        expect([...FX.bulge(0.6)]).toEqual([
            { type: 'bulge', strength: 0.6 },
        ]);
    });

    it('bulge accepts negative strength (pinch)', () => {
        expect([...FX.bulge(-0.4)]).toEqual([
            { type: 'bulge', strength: -0.4 },
        ]);
    });

    it('invert defaults to rgba at full strength', () => {
        expect([...FX.invert()]).toEqual([
            { type: 'invert', channel: 'rgba', strength: 1 },
        ]);
    });

    it('invert accepts a channel and strength', () => {
        expect([...FX.invert('hue', 0.5)]).toEqual([
            { type: 'invert', channel: 'hue', strength: 0.5 },
        ]);
    });

    it('scatter defaults to both axes', () => {
        expect([...FX.scatter(10)]).toEqual([
            { type: 'scatter', strength: 10, direction: 'both' },
        ]);
    });

    it('scatter accepts a constrained direction', () => {
        expect([...FX.scatter(5, 'horizontal')]).toEqual([
            { type: 'scatter', strength: 5, direction: 'horizontal' },
        ]);
    });

    it('posterize defaults to 4 levels', () => {
        expect([...FX.posterize()]).toEqual([{ type: 'posterize', level: 4 }]);
    });

    it('posterize accepts an explicit level', () => {
        expect([...FX.posterize(2)]).toEqual([{ type: 'posterize', level: 2 }]);
    });

    it('motionBlur defaults to a centered both-axis smear', () => {
        expect([...FX.motionBlur()]).toEqual([
            { type: 'motionBlur', length: 50, alignment: 'centered', samples: 16, strength: 1, axis: 'both' },
        ]);
    });

    it('motionBlur accepts explicit params', () => {
        expect([...FX.motionBlur(80, 'ahead', 32, 2, 'x')]).toEqual([
            { type: 'motionBlur', length: 80, alignment: 'ahead', samples: 32, strength: 2, axis: 'x' },
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
        const arr = [...FX.blur(2).pixelate(10)];
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
