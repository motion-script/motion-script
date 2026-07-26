import { describe, it, expect } from 'vitest';
import { Presets } from '@/attributes/shape/effects/presets';
import { EffectChain, Effects, resolveChainEffects } from '@/attributes/shape/effects/chain';
import { lerpEffectArray } from '@/attributes/shape/effects/registry';
import type { SceneEffect } from '@/attributes/shape/effects/union';

/** Every preset, as `[name, builder]`, so the contract tests run over all of them. */
const ALL = Object.entries(Presets) as [string, (a?: number) => EffectChain][];

/**
 * Fields that are *visible* at their neutral value — i.e. an effect carrying only
 * these at neutral draws nothing. Used to assert a preset at `amount: 0` is inert
 * without hard-coding each recipe's shape.
 */
const NEUTRAL: Record<string, (e: any) => boolean> = {
    halftone: (e) => e.size <= 1,
    duotone: (e) => e.amount === 0,
    grain: (e) => e.amount === 0,
    edges: (e) => e.strength === 0,
    grayscale: (e) => e.amount === 0,
    posterize: (e) => e.levels >= 255,
    vintage: (e) => e.amount === 0 && e.warmth === 0,
    blockDisplace: (e) => e.amount === 0,
    rgbShift: (e) => e.red.x === 0 && e.red.y === 0 && e.blue.x === 0 && e.blue.y === 0,
    scanlines: (e) => e.darkness === 0,
    bulge: (e) => e.strength === 0,
    bloom: (e) => e.intensity === 0,
    vignette: (e) => e.amount === 0,
    bitCrush: (e) => e.amount === 0,
    pixelate: (e) => e.blocks.x >= 1920,
    dither: (e) => e.levels >= 255,
};

describe('Presets', () => {
    it('exposes the print and screen families', () => {
        expect(Object.keys(Presets).sort()).toEqual([
            'blueprint', 'crt', 'gameboy', 'glitch', 'newsprint', 'photocopy', 'riso', 'vhs',
        ]);
    });

    it.each(ALL)('%s returns a chainable EffectChain', (_name, preset) => {
        const chain = preset();
        expect(chain).toBeInstanceOf(EffectChain);
        // The whole point of returning a chain: you can keep building on it.
        expect(chain.blur(4).list.length).toBe(chain.list.length + 1);
    });

    it.each(ALL)('%s composes more than one effect', (_name, preset) => {
        expect(preset().list.length).toBeGreaterThan(1);
    });

    // The contract that makes a preset animatable: 0 must draw nothing.
    it.each(ALL)('%s at amount 0 leaves every ingredient neutral', (_name, preset) => {
        for (const effect of preset(0).list) {
            const check = NEUTRAL[effect.type];
            expect(check, `no neutrality rule for '${effect.type}'`).toBeDefined();
            expect(check(effect), `'${effect.type}' is not neutral at amount 0`).toBe(true);
        }
    });

    it.each(ALL)('%s at amount 1 has visible ingredients', (_name, preset) => {
        const anyActive = preset(1).list.some((effect) => {
            const check = NEUTRAL[effect.type];
            return check ? !check(effect) : true;
        });
        expect(anyActive).toBe(true);
    });

    it.each(ALL)('%s keeps a constant chain shape across amounts', (_name, preset) => {
        // Interpolating between two chains pairs them up by index, so a recipe
        // whose length or ordering changed with `amount` would pop mid-tween.
        const shape = (a: number) => preset(a).list.map((e) => e.type);
        expect(shape(0)).toEqual(shape(1));
        expect(shape(0.5)).toEqual(shape(1));
    });

    it.each(ALL)('%s(n) is identical to its options form', (_name, preset) => {
        expect([...preset(0.4)]).toEqual([...(preset as any)({ amount: 0.4 })]);
    });

    it.each(ALL)('%s clamps amounts outside 0–1', (_name, preset) => {
        expect([...preset(-1)]).toEqual([...preset(0)]);
        expect([...preset(5)]).toEqual([...preset(1)]);
    });

    it('defaults to the full look', () => {
        expect([...Presets.riso()]).toEqual([...Presets.riso(1)]);
    });
});

describe('Preset recipes', () => {
    it('riso screens before it inks', () => {
        // Inking first would leave the halftone chewing through an already
        // coloured image — not how a riso works, and it doesn't look like one.
        expect(Presets.riso().list.map((e) => e.type)).toEqual(['halftone', 'duotone', 'grain']);
    });

    it('vhs damages before it separates, and screens last', () => {
        expect(Presets.vhs().list.map((e) => e.type)).toEqual([
            'vintage', 'blockDisplace', 'rgbShift', 'scanlines', 'grain',
        ]);
    });

    it('gameboy pixelates before dithering so cells land on the fake grid', () => {
        expect(Presets.gameboy().list.map((e) => e.type)).toEqual(['pixelate', 'dither', 'bitCrush']);
    });

    it('carries preset-specific options through to the right effect', () => {
        const [, duotone] = Presets.riso({ ink: '#ff0000', paper: '#00ff00' }).list;
        expect(duotone).toMatchObject({ type: 'duotone', shadows: '#ff0000', highlights: '#00ff00' });
    });

    it('holds a discrete choice fixed while its scalar fades in', () => {
        // A palette can't be interpolated, so `amount` has to carry the fade.
        const [, , crushOff] = Presets.gameboy(0).list;
        const [, , crushOn] = Presets.gameboy(1).list;
        expect(crushOff).toMatchObject({ palette: 'gameboy', amount: 0 });
        expect(crushOn).toMatchObject({ palette: 'gameboy', amount: 1 });
    });
});

describe('Presets in a chain', () => {
    it('can be extended with further effects', () => {
        const chain = Presets.crt(0.6).blur(2);
        expect(chain.list.at(-1)).toEqual({ type: 'blur', radius: 2 });
    });

    it('flattens when mixed into an effects array', () => {
        const resolved = resolveChainEffects([Presets.riso(1), Effects.blur(3)]);
        expect(resolved.map((e) => e.type)).toEqual(['halftone', 'duotone', 'grain', 'blur']);
    });

    it('interpolates pairwise between two amounts of the same preset', () => {
        const from = resolveChainEffects(Presets.newsprint(0)) as SceneEffect[];
        const to = resolveChainEffects(Presets.newsprint(1)) as SceneEffect[];
        const mid = lerpEffectArray(from, to, 0.5);

        expect(mid.map((e) => e.type)).toEqual(['halftone', 'duotone', 'grain']);
        expect(mid[1]).toMatchObject({ type: 'duotone', amount: 0.5 });
    });
});
