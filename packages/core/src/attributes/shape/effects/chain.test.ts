import { describe, it, expect } from 'vitest';
import { Effects, FX, resolveChainEffects } from '@/attributes/shape/effects/chain';
import {
    resolveEffectColor,
    sameEffectColor,
    withEffectOptions,
} from '@/attributes/shape/effects/effect-data';
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

    it('displace defaults to the rg channel and a signed midpoint', () => {
        expect([...Effects.displace({ src: 'map.png' })]).toEqual([
            { type: 'displace', src: 'map.png', amount: { x: 20, y: 20 }, channel: 'rg', midpoint: 0.5, scale: 1, angle: 0 },
        ]);
    });

    it('displace spreads a scalar amount across both axes', () => {
        expect([...Effects.displace({ src: 'map.png', amount: 8 })]).toEqual([
            { type: 'displace', src: 'map.png', amount: { x: 8, y: 8 }, channel: 'rg', midpoint: 0.5, scale: 1, angle: 0 },
        ]);
    });

    it('wave reads a scalar amplitude as transverse (Y only)', () => {
        // A wave displacing along its own travel direction just smears, so the
        // terse form is the one that actually ripples.
        expect([...Effects.wave(20)]).toEqual([
            { type: 'wave', amplitude: { x: 0, y: 20 }, wavelength: 120, phase: 0, shape: 'linear', angle: 0, center: { x: 0.5, y: 0.5 } },
        ]);
    });

    it('wave accepts a per-axis amplitude', () => {
        const [effect] = [...Effects.wave({ amplitude: { x: 6, y: 0 }, shape: 'radial' })];
        expect(effect).toMatchObject({ type: 'wave', amplitude: { x: 6, y: 0 }, shape: 'radial' });
    });

    it('twirl takes angle as the scalar', () => {
        expect([...Effects.twirl(90)]).toEqual([
            { type: 'twirl', angle: 90, radius: 1, center: { x: 0.5, y: 0.5 } },
        ]);
    });

    it('progressiveBlur defaults to a downward linear ramp', () => {
        expect([...Effects.progressiveBlur(24)]).toEqual([
            { type: 'progressiveBlur', radius: 24, shape: 'linear', start: 0, end: 1, angle: 90, center: { x: 0.5, y: 0.5 }, samples: 20 },
        ]);
    });

    it('kaleidoscope rounds segments and defaults to a full fold', () => {
        expect([...Effects.kaleidoscope({ segments: 6.4 })]).toEqual([
            { type: 'kaleidoscope', segments: 6, angle: 0, center: { x: 0.5, y: 0.5 }, offset: 0, amount: 1 },
        ]);
    });

    it('trails rounds echoes and defaults to a screen blend', () => {
        expect([...Effects.trails(8)]).toEqual([
            { type: 'trails', echoes: 8, delay: 1 / 24, decay: 0.72, blend: 'screen' },
        ]);
    });

    it('the new warps all carry mode like every other effect', () => {
        for (const chain of [
            Effects.wave({ amplitude: 4, mode: 'backdrop' }),
            Effects.twirl({ angle: 30, mode: 'backdrop' }),
            Effects.displace({ src: 'm.png', mode: 'backdrop' }),
            Effects.progressiveBlur({ radius: 8, mode: 'backdrop' }),
        ]) {
            expect([...chain][0]).toMatchObject({ mode: 'backdrop' });
        }
    });

    it('FX is an alias for Effects', () => {
        expect(FX).toBe(Effects);
    });
});

describe('FX builders — roadmap effects', () => {
    it('outline defaults to a 4px black band outside the silhouette', () => {
        expect([...Effects.outline()]).toEqual([
            { type: 'outline', width: 4, color: 'black', position: 'outside' },
        ]);
    });

    it('outline takes width as the scalar with colour and position named', () => {
        expect([...Effects.outline({ width: 10, color: '#ff0044', position: 'inside' })]).toEqual([
            { type: 'outline', width: 10, color: '#ff0044', position: 'inside' },
        ]);
    });

    it('vignette defaults to a soft black falloff', () => {
        expect([...Effects.vignette()]).toEqual([
            { type: 'vignette', amount: 0.5, radius: 0.75, softness: 0.5, color: 'black' },
        ]);
    });

    it('grain defaults to static luminance noise', () => {
        expect([...Effects.grain()]).toEqual([
            { type: 'grain', amount: 0.25, size: 1, seed: 0, animated: false, colored: false },
        ]);
    });

    it('grain accepts the animated + coloured variant', () => {
        expect([...Effects.grain({ amount: 0.4, animated: true, colored: true })]).toEqual([
            { type: 'grain', amount: 0.4, size: 1, seed: 0, animated: true, colored: true },
        ]);
    });

    it('sharpen defaults to a 1px unsharp mask', () => {
        expect([...Effects.sharpen()]).toEqual([{ type: 'sharpen', amount: 1, radius: 1 }]);
    });

    it('edges defaults to a monochrome sobel', () => {
        expect([...Effects.edges()]).toEqual([
            { type: 'edges', strength: 1, kernel: 'sobel', colored: false },
        ]);
    });

    it('edges accepts the other kernels', () => {
        expect([...Effects.edges({ kernel: 'laplacian' })]).toEqual([
            { type: 'edges', strength: 1, kernel: 'laplacian', colored: false },
        ]);
    });

    it('threshold defaults to a midpoint cut with a hair of smoothing', () => {
        expect([...Effects.threshold()]).toEqual([
            { type: 'threshold', level: 0.5, smoothness: 0.05 },
        ]);
    });

    it('radialBlur defaults to a centred zoom', () => {
        expect([...Effects.radialBlur()]).toEqual([
            { type: 'radialBlur', amount: 0.5, style: 'zoom', center: { x: 0.5, y: 0.5 }, samples: 16 },
        ]);
    });

    it('radialBlur accepts a spin about an off-centre point', () => {
        expect([...Effects.radialBlur({ amount: 0.8, style: 'spin', center: { x: 0.2, y: 0.7 } })]).toEqual([
            { type: 'radialBlur', amount: 0.8, style: 'spin', center: { x: 0.2, y: 0.7 }, samples: 16 },
        ]);
    });

    it('halftone defaults to an 8px dot screen at 45°', () => {
        expect([...Effects.halftone()]).toEqual([
            { type: 'halftone', size: 8, angle: 45, shape: 'dot', separation: 'mono' },
        ]);
    });

    it('dither defaults to 1-bit output through a 4×4 Bayer matrix', () => {
        expect([...Effects.dither()]).toEqual([
            { type: 'dither', levels: 2, matrix: 4, scale: 1, monochrome: false, noise: 'bayer' },
        ]);
    });

    it('dither takes blue noise instead of the ordered matrix', () => {
        // `matrix` is still carried (it is simply unused) so switching `noise`
        // back and forth doesn't lose the Bayer setting.
        expect([...Effects.dither({ levels: 3, noise: 'blue' })]).toEqual([
            { type: 'dither', levels: 3, matrix: 4, scale: 1, monochrome: false, noise: 'blue' },
        ]);
    });

    it('duotone defaults to a full black→white ramp', () => {
        expect([...Effects.duotone()]).toEqual([
            { type: 'duotone', amount: 1, shadows: 'black', highlights: 'white' },
        ]);
    });

    it('curves carries its points through and defaults the channel', () => {
        const points: [number, number][] = [[0, 0.1], [1, 0.9]];
        expect([...Effects.curves({ points })]).toEqual([
            { type: 'curves', points, channel: 'rgb' },
        ]);
    });

    it('colorAdjustment keeps only the fields it was given', () => {
        expect([...Effects.colorAdjustment({ contrast: 1.4, saturation: 0.6 })]).toEqual([
            { type: 'colorAdjustment', contrast: 1.4, saturation: 0.6 },
        ]);
    });

    it('colorAdjustment does not plant a mode key when passed an explicit undefined', () => {
        // The spread of the caller's options would otherwise carry `mode: undefined`
        // onto the effect, and every `equals()` compares `mode` directly.
        const [effect] = [...Effects.colorAdjustment({ brightness: 0.2, mode: undefined })];
        expect('mode' in effect).toBe(false);
    });

    it('rgbShift spreads red and blue apart horizontally by default', () => {
        expect([...Effects.rgbShift()]).toEqual([
            {
                type: 'rgbShift',
                red: { x: 4, y: 0 },
                green: { x: 0, y: 0 },
                blue: { x: -4, y: 0 },
            },
        ]);
    });

    it('rgbShift lets a named channel override the scalar spread', () => {
        expect([...Effects.rgbShift({ amount: 6, green: { x: 0, y: 3 } })]).toEqual([
            {
                type: 'rgbShift',
                red: { x: 6, y: 0 },
                green: { x: 0, y: 3 },
                blue: { x: -6, y: 0 },
            },
        ]);
    });

    it('scanlines default to 4px bands at half darkness', () => {
        expect([...Effects.scanlines()]).toEqual([
            { type: 'scanlines', spacing: 4, thickness: 0.5, darkness: 0.5, offset: 0, angle: 0 },
        ]);
    });

    it('blockDisplace defaults to sparse horizontal tears', () => {
        expect([...Effects.blockDisplace()]).toEqual([
            { type: 'blockDisplace', amount: 20, size: 16, density: 0.3, seed: 0, axis: 'x' },
        ]);
    });

    it('bitCrush defaults to 3 bits per channel with no palette', () => {
        expect([...Effects.bitCrush()]).toEqual([
            { type: 'bitCrush', bits: 3, palette: 'none', amount: 1 },
        ]);
    });

    it('bitCrush accepts a fixed hardware palette', () => {
        expect([...Effects.bitCrush({ palette: 'gameboy' })]).toEqual([
            { type: 'bitCrush', bits: 3, palette: 'gameboy', amount: 1 },
        ]);
    });

    it('ascii defaults to a 12px standard-ramp grid, white on black', () => {
        expect([...Effects.ascii()]).toEqual([
            {
                type: 'ascii',
                size: 12,
                charset: 'standard',
                fontFamily: 'monospace',
                ink: 'white',
                background: 'black',
                colored: false,
            },
        ]);
    });

    it('ascii accepts a custom ramp string in place of a named charset', () => {
        const [effect] = [...Effects.ascii({ size: 8, charset: ' .oO@' })];
        expect(effect).toMatchObject({ size: 8, charset: ' .oO@' });
    });

    it('carries the backdrop mode like every other effect', () => {
        expect([...Effects.halftone({ size: 6, mode: 'backdrop' })]).toEqual([
            { type: 'halftone', size: 6, angle: 45, shape: 'dot', separation: 'mono', mode: 'backdrop' },
        ]);
    });
});

describe('colour-valued options', () => {
    it('are stored as authored so a raw literal and a builder agree', () => {
        // Parsing at build time would make `Effects.outline({ color: 'primary' })`
        // and `{ type: 'outline', color: 'primary', … }` two different effects.
        const [effect] = [...Effects.outline({ color: 'rebeccapurple' })];
        expect(effect).toMatchObject({ color: 'rebeccapurple' });
    });

    it('accept a pre-normalised tuple as readily as a string', () => {
        const [effect] = [...Effects.duotone({ shadows: [0, 0, 0, 1], highlights: 'white' })];
        expect(effect).toMatchObject({ shadows: [0, 0, 0, 1], highlights: 'white' });
    });

    it('resolveEffectColor turns either spelling into the same RGBA', () => {
        expect(resolveEffectColor('#ff0000')).toEqual([1, 0, 0, 1]);
        expect(resolveEffectColor([1, 0, 0, 1])).toEqual([1, 0, 0, 1]);
    });

    it('sameEffectColor compares by resolved value, not by spelling', () => {
        expect(sameEffectColor('red', '#ff0000')).toBe(true);
        expect(sameEffectColor('red', [1, 0, 0, 1])).toBe(true);
        expect(sameEffectColor('red', 'blue')).toBe(false);
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
        ['outline', () => Effects.outline(6), () => Effects.outline({ width: 6 })],
        ['vignette', () => Effects.vignette(0.8), () => Effects.vignette({ amount: 0.8 })],
        ['grain', () => Effects.grain(0.4), () => Effects.grain({ amount: 0.4 })],
        ['sharpen', () => Effects.sharpen(1.5), () => Effects.sharpen({ amount: 1.5 })],
        ['edges', () => Effects.edges(2), () => Effects.edges({ strength: 2 })],
        ['threshold', () => Effects.threshold(0.4), () => Effects.threshold({ level: 0.4 })],
        ['radialBlur', () => Effects.radialBlur(0.3), () => Effects.radialBlur({ amount: 0.3 })],
        ['halftone', () => Effects.halftone(12), () => Effects.halftone({ size: 12 })],
        ['dither', () => Effects.dither(4), () => Effects.dither({ levels: 4 })],
        ['duotone', () => Effects.duotone(0.7), () => Effects.duotone({ amount: 0.7 })],
        ['rgbShift', () => Effects.rgbShift(6), () => Effects.rgbShift({ amount: 6 })],
        ['scanlines', () => Effects.scanlines(0.8), () => Effects.scanlines({ darkness: 0.8 })],
        ['blockDisplace', () => Effects.blockDisplace(30), () => Effects.blockDisplace({ amount: 30 })],
        ['bitCrush', () => Effects.bitCrush(2), () => Effects.bitCrush({ bits: 2 })],
        ['ascii', () => Effects.ascii(16), () => Effects.ascii({ size: 16 })],
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

    it('picks up the roadmap shader effects in author order', () => {
        const effects = resolveChainEffects(
            Effects.halftone(8).outline(4).vignette(0.5).dither(2),
        );
        expect(foregroundShaderEffects(effects).map((e) => e.type)).toEqual([
            'halftone', 'outline', 'vignette', 'dither',
        ]);
    });

    it('picks up the glitch cluster in author order', () => {
        const effects = resolveChainEffects(
            Effects.blockDisplace(20).rgbShift(6).scanlines(0.4).bitCrush(2),
        );
        expect(foregroundShaderEffects(effects).map((e) => e.type)).toEqual([
            'blockDisplace', 'rgbShift', 'scanlines', 'bitCrush',
        ]);
    });

    it('leaves the colour-matrix roadmap effects on the filter path', () => {
        // duotone/curves/colorAdjustment are affine in the source channels, so
        // they compose as ImageFilters rather than opening a snapshot scope.
        const effects = resolveChainEffects(
            Effects.duotone(1).curves({ points: [[0, 0], [1, 1]] }).colorAdjustment({ contrast: 1.2 }),
        );
        expect(foregroundShaderEffects(effects)).toEqual([]);
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
