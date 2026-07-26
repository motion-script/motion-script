import { describe, it, expect } from 'vitest';
import { Effects, FX, resolveChainEffects } from '@/attributes/shape/effects/chain';
import { withEffectOptions } from '@/attributes/shape/effects/effect-data';
import { foregroundShaderEffects } from '@/attributes/shape/effects/backdrop';

describe('FX builders', () => {
    it('blur produces a single blur effect', () => {
        expect([...Effects.blur(4)]).toEqual([{ type: 'blur', radius: 4 }]);
    });

    it('blur with { mode: "backdrop" } flags the effect as a backdrop filter', () => {
        expect([...Effects.blur({ radius: 12, mode: "backdrop" })]).toEqual([
            { type: 'blur', radius: 12, mode: "backdrop" },
        ]);
    });

    it('grayscale carries the mode flag too', () => {
        expect([...Effects.grayscale({ amount: 1, mode: "backdrop" })]).toEqual([
            { type: 'grayscale', amount: 1, mode: "backdrop" },
        ]);
    });

    it('omitting mode leaves it unset rather than undefined (foreground effect)', () => {
        const [effect] = [...Effects.blur(12)];
        expect(effect).toEqual({ type: 'blur', radius: 12 });
        // Not merely `undefined` — the key must be absent, because every
        // per-effect `equals()` compares `mode` directly.
        expect('mode' in effect).toBe(false);
    });

    it('directionalBlur takes radius as the scalar and defaults angle to 0', () => {
        expect([...Effects.directionalBlur(20)]).toEqual([
            { type: 'directionalBlur', radius: 20, angle: 0 },
        ]);
        expect([...Effects.directionalBlur({ radius: 20, angle: 45 })]).toEqual([
            { type: 'directionalBlur', radius: 20, angle: 45 },
        ]);
    });

    it('pixelate maps a bare number to equal block counts and sharp colours', () => {
        expect([...Effects.pixelate(20)]).toEqual([
            { type: 'pixelate', blocks: { x: 20, y: 20 }, sharpColors: true },
        ]);
    });

    it('pixelate accepts a uniform block count with options', () => {
        expect([...Effects.pixelate({ blocks: 32, sharpColors: false })]).toEqual([
            { type: 'pixelate', blocks: { x: 32, y: 32 }, sharpColors: false },
        ]);
    });

    it('pixelate accepts per-axis block counts as one vector', () => {
        expect([...Effects.pixelate({ blocks: { x: 200, y: 180 } })]).toEqual([
            { type: 'pixelate', blocks: { x: 200, y: 180 }, sharpColors: true },
        ]);
    });

    it('grayscale produces a grayscale effect', () => {
        expect([...Effects.grayscale(0.5)]).toEqual([{ type: 'grayscale', amount: 0.5 }]);
    });

    it('bulge takes strength as the scalar and centres by default', () => {
        expect([...Effects.bulge(0.6)]).toEqual([
            { type: 'bulge', strength: 0.6, center: { x: 0.5, y: 0.5 } },
        ]);
    });

    it('bulge accepts negative strength (pinch) and an explicit centre', () => {
        expect([...Effects.bulge({ strength: -0.4, center: { x: 0.2, y: 0.8 } })]).toEqual([
            { type: 'bulge', strength: -0.4, center: { x: 0.2, y: 0.8 } },
        ]);
    });

    it('magnify defaults to backdrop mode but allows an override', () => {
        expect([...Effects.magnify(3)]).toEqual([
            { type: 'magnify', scale: 3, center: { x: 0.5, y: 0.5 }, mode: 'backdrop' },
        ]);
        expect([...Effects.magnify({ scale: 2, mode: 'foreground' })]).toEqual([
            { type: 'magnify', scale: 2, center: { x: 0.5, y: 0.5 }, mode: 'foreground' },
        ]);
    });

    it('magnify takes centre as a named option, not a second positional', () => {
        expect([...Effects.magnify({ scale: 1.5, center: { x: 0.3, y: 0.4 } })]).toEqual([
            { type: 'magnify', scale: 1.5, center: { x: 0.3, y: 0.4 }, mode: 'backdrop' },
        ]);
    });

    it('bloom takes intensity as the scalar', () => {
        expect([...Effects.bloom(2.5)]).toEqual([
            { type: 'bloom', threshold: 0.7, radius: 12, intensity: 2.5 },
        ]);
    });

    it('invert defaults to rgba at full strength', () => {
        expect([...Effects.invert()]).toEqual([
            { type: 'invert', channel: 'rgba', strength: 1 },
        ]);
    });

    it('invert takes strength as the scalar with channel named', () => {
        expect([...Effects.invert({ channel: 'hue', strength: 0.5 })]).toEqual([
            { type: 'invert', channel: 'hue', strength: 0.5 },
        ]);
        expect([...Effects.invert(0.5)]).toEqual([
            { type: 'invert', channel: 'rgba', strength: 0.5 },
        ]);
    });

    it('scatter defaults to both axes', () => {
        expect([...Effects.scatter(10)]).toEqual([
            { type: 'scatter', strength: 10, axis: 'both' },
        ]);
    });

    it('scatter accepts a constrained axis', () => {
        expect([...Effects.scatter({ strength: 5, axis: 'x' })]).toEqual([
            { type: 'scatter', strength: 5, axis: 'x' },
        ]);
    });

    it('posterize defaults to 4 levels', () => {
        expect([...Effects.posterize()]).toEqual([{ type: 'posterize', levels: 4 }]);
    });

    it('posterize accepts an explicit level count', () => {
        expect([...Effects.posterize(2)]).toEqual([{ type: 'posterize', levels: 2 }]);
    });

    it('motionBlur defaults to a centered both-axis smear', () => {
        expect([...Effects.motionBlur()]).toEqual([
            { type: 'motionBlur', length: 50, alignment: 'centered', samples: 16, strength: 1, axis: 'both' },
        ]);
    });

    it('motionBlur accepts explicit params', () => {
        expect([...Effects.motionBlur({ length: 80, alignment: 'ahead', samples: 32, strength: 2, axis: 'x' })]).toEqual([
            { type: 'motionBlur', length: 80, alignment: 'ahead', samples: 32, strength: 2, axis: 'x' },
        ]);
    });

    it('sksl defaults to a foreground screen-blended overlay', () => {
        expect([...Effects.sksl({ shader: 'half4 main() { return half4(1); }' })]).toEqual([
            {
                type: 'sksl',
                shader: 'half4 main() { return half4(1); }',
                uniforms: [],
                blendMode: 'screen',
                mode: 'foreground',
            },
        ]);
    });

    it('sksl in backdrop mode omits blendMode', () => {
        const [effect] = [...Effects.sksl({ shader: 'src', mode: 'backdrop' })];
        expect(effect).toEqual({ type: 'sksl', shader: 'src', uniforms: [], mode: 'backdrop' });
        expect('blendMode' in effect).toBe(false);
    });

    it('FX is an alias for Effects', () => {
        expect(FX).toBe(Effects);
    });
});

describe('scalar shorthand', () => {
    // The whole point of `number | Options`: the two spellings must be
    // indistinguishable once built, so docs and call sites can use either.
    it.each([
        ['blur', () => Effects.blur(8), () => Effects.blur({ radius: 8 })],
        ['grayscale', () => Effects.grayscale(1), () => Effects.grayscale({ amount: 1 })],
        ['pixelate', () => Effects.pixelate(16), () => Effects.pixelate({ blocks: 16 })],
        ['bulge', () => Effects.bulge(0.5), () => Effects.bulge({ strength: 0.5 })],
        ['magnify', () => Effects.magnify(2), () => Effects.magnify({ scale: 2 })],
        ['bloom', () => Effects.bloom(1.5), () => Effects.bloom({ intensity: 1.5 })],
        ['vintage', () => Effects.vintage(0.8), () => Effects.vintage({ amount: 0.8 })],
        ['chromaticAberration', () => Effects.chromaticAberration(6), () => Effects.chromaticAberration({ amount: 6 })],
        ['invert', () => Effects.invert(0.3), () => Effects.invert({ strength: 0.3 })],
        ['scatter', () => Effects.scatter(12), () => Effects.scatter({ strength: 12 })],
        ['posterize', () => Effects.posterize(3), () => Effects.posterize({ levels: 3 })],
        ['directionalBlur', () => Effects.directionalBlur(30), () => Effects.directionalBlur({ radius: 30 })],
        ['motionBlur', () => Effects.motionBlur(90), () => Effects.motionBlur({ length: 90 })],
    ])('%s(n) is identical to its options form', (_name, scalar, options) => {
        expect([...scalar()]).toEqual([...options()]);
    });
});

describe('withEffectOptions', () => {
    it('omits undefined option keys rather than writing them', () => {
        const effect = withEffectOptions({ type: 'blur' as const, radius: 4 }, { mode: undefined });
        expect('mode' in effect).toBe(false);
    });

    it('copies a defined mode through', () => {
        expect(withEffectOptions({ type: 'blur' as const, radius: 4 }, { mode: 'backdrop' })).toEqual({
            type: 'blur', radius: 4, mode: 'backdrop',
        });
    });
});

describe('foregroundShaderEffects', () => {
    it('preserves author chain order instead of a fixed sequence', () => {
        const bulgeFirst = resolveChainEffects(Effects.bulge(0.5).posterize(4));
        expect(foregroundShaderEffects(bulgeFirst).map((e) => e.type)).toEqual(['bulge', 'posterize']);

        const posterizeFirst = resolveChainEffects(Effects.posterize(4).bulge(0.5));
        expect(foregroundShaderEffects(posterizeFirst).map((e) => e.type)).toEqual(['posterize', 'bulge']);
    });

    it('returns every shader effect, not just the first of each type', () => {
        const effects = resolveChainEffects(Effects.bulge(0.2).bulge(0.4).posterize(8));
        expect(foregroundShaderEffects(effects)).toHaveLength(3);
    });

    it('excludes filter-surface effects and backdrop-mode effects', () => {
        const effects = resolveChainEffects(
            Effects.blur(4).grayscale(1).bulge(0.5).posterize({ levels: 4, mode: 'backdrop' }),
        );
        expect(foregroundShaderEffects(effects).map((e) => e.type)).toEqual(['bulge']);
    });

    it('treats a foreground sksl overlay as a filter, not a shader scope', () => {
        // Its surface is mode-dependent: the foreground variant composes as an
        // ImageFilter, only the backdrop variant resamples its source.
        const foreground = resolveChainEffects(Effects.sksl({ shader: 'src' }));
        expect(foregroundShaderEffects(foreground)).toEqual([]);
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

    it('normalises an array, preserving its effects', () => {
        const arr = [{ type: 'blur', radius: 1 } as const];
        expect(resolveChainEffects(arr)).toEqual(arr);
    });

    it('flattens chains used as array elements', () => {
        const arr = [{ type: 'invert', channel: 'rgba', strength: 1 } as const, Effects.blur(2)];
        expect(resolveChainEffects(arr)).toEqual([
            { type: 'invert', channel: 'rgba', strength: 1 },
            { type: 'blur', radius: 2 },
        ]);
    });

    it('wraps a single effect into an array', () => {
        expect(resolveChainEffects({ type: 'blur', radius: 5 })).toEqual([{ type: 'blur', radius: 5 }]);
    });
});
