import { describe, it, expect } from 'vitest';
import { Effects, resolveChainEffects } from '@/attributes/shape/effects/chain';

describe('FX builders', () => {
    it('blur produces a single blur effect', () => {
        expect([...Effects.blur(4)]).toEqual([{ type: 'blur', radius: 4 }]);
    });

    it('blur with { backdrop: true } flags the effect as a backdrop filter', () => {
        expect([...Effects.blur(12, { backdrop: true })]).toEqual([
            { type: 'blur', radius: 12, backdrop: true },
        ]);
    });

    it('grayscale carries the backdrop flag too', () => {
        expect([...Effects.grayscale(1, { backdrop: true })]).toEqual([
            { type: 'grayscale', amount: 1, backdrop: true },
        ]);
    });

    it('omitting opts leaves backdrop unset (foreground effect)', () => {
        expect([...Effects.blur(12)]).toEqual([{ type: 'blur', radius: 12 }]);
    });

    it('directionalBlur produces a direction and blurLength effect', () => {
        expect([...Effects.directionalBlur(45, 20)]).toEqual([
            { type: 'directionalBlur', direction: 45, blurLength: 20 },
        ]);
    });

    it('pixelate maps a bare number to equal block counts and sharp colours', () => {
        expect([...Effects.pixelate(20)]).toEqual([
            { type: 'pixelate', horizontalBlocks: 20, verticalBlocks: 20, sharpColors: true },
        ]);
    });

    it('pixelate accepts a uniform { blocks } object', () => {
        expect([...Effects.pixelate({ blocks: 32, sharpColors: false })]).toEqual([
            { type: 'pixelate', horizontalBlocks: 32, verticalBlocks: 32, sharpColors: false },
        ]);
    });

    it('pixelate accepts per-axis block counts', () => {
        expect([...Effects.pixelate({ horizontalBlocks: 200, verticalBlocks: 180 })]).toEqual([
            { type: 'pixelate', horizontalBlocks: 200, verticalBlocks: 180, sharpColors: true },
        ]);
    });

    it('grayscale produces a grayscale effect', () => {
        expect([...Effects.grayscale(0.5)]).toEqual([{ type: 'grayscale', amount: 0.5 }]);
    });

    it('bulge produces a strength-only effect', () => {
        expect([...Effects.bulge(0.6)]).toEqual([
            { type: 'bulge', strength: 0.6 },
        ]);
    });

    it('bulge accepts negative strength (pinch)', () => {
        expect([...Effects.bulge(-0.4)]).toEqual([
            { type: 'bulge', strength: -0.4 },
        ]);
    });

    it('invert defaults to rgba at full strength', () => {
        expect([...Effects.invert()]).toEqual([
            { type: 'invert', channel: 'rgba', strength: 1 },
        ]);
    });

    it('invert accepts a channel and strength', () => {
        expect([...Effects.invert('hue', 0.5)]).toEqual([
            { type: 'invert', channel: 'hue', strength: 0.5 },
        ]);
    });

    it('scatter defaults to both axes', () => {
        expect([...Effects.scatter(10)]).toEqual([
            { type: 'scatter', strength: 10, direction: 'both' },
        ]);
    });

    it('scatter accepts a constrained direction', () => {
        expect([...Effects.scatter(5, 'horizontal')]).toEqual([
            { type: 'scatter', strength: 5, direction: 'horizontal' },
        ]);
    });

    it('posterize defaults to 4 levels', () => {
        expect([...Effects.posterize()]).toEqual([{ type: 'posterize', level: 4 }]);
    });

    it('posterize accepts an explicit level', () => {
        expect([...Effects.posterize(2)]).toEqual([{ type: 'posterize', level: 2 }]);
    });

    it('motionBlur defaults to a centered both-axis smear', () => {
        expect([...Effects.motionBlur()]).toEqual([
            { type: 'motionBlur', length: 50, alignment: 'centered', samples: 16, strength: 1, axis: 'both' },
        ]);
    });

    it('motionBlur accepts explicit params', () => {
        expect([...Effects.motionBlur(80, 'ahead', 32, 2, 'x')]).toEqual([
            { type: 'motionBlur', length: 80, alignment: 'ahead', samples: 32, strength: 2, axis: 'x' },
        ]);
    });
});

describe('EffectChain', () => {
    it('appends effects in order while staying immutable', () => {
        const base = Effects.blur(4);
        const extended = base.grayscale(1);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'grayscale', amount: 1 });
    });

    it('is iterable for spreading into an array', () => {
        const arr = [...Effects.blur(2).pixelate(10)];
        expect(arr).toHaveLength(2);
        expect(arr[0]).toEqual({ type: 'blur', radius: 2 });
    });

    it('toJSON returns the raw effect list', () => {
        const chain = Effects.blur(8);
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('resolveChainEffects', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainEffects(undefined)).toEqual([]);
    });

    it('unwraps an EffectChain to its list', () => {
        const chain = Effects.blur(3);
        expect(resolveChainEffects(chain)).toBe(chain.list);
    });

    it('passes an array through unchanged', () => {
        const arr = [{ type: 'blur', radius: 1 } as const];
        expect(resolveChainEffects(arr)).toBe(arr);
    });

    it('wraps a single effect into an array', () => {
        expect(resolveChainEffects({ type: 'blur', blur: 5 })).toEqual([{ type: 'blur', radius: 5 }]);
    });
});
