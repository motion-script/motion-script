import { describe, it, expect } from 'vitest';
import { Effects, EffectChain } from '@/attributes/shape/effects/chain';
import { effectTypes, effectSurface, lerpEffect } from '@/attributes/shape/effects/registry';
import type { SceneEffect } from '@/attributes/shape/effects/union';

/**
 * The neutral-form contract.
 *
 * An effect can only be *animated on* if it has a parameter setting at which it
 * draws nothing — something to tween from. That is a real property of each
 * effect, not of any recipe that happens to use it, so it is asserted over the
 * whole registry: {@link NEUTRAL} and {@link NO_NEUTRAL} between them must cover
 * every registered type, which means a new effect can't be added without
 * deciding which of the two it is.
 *
 * Two effects have a neutral that is *practical* rather than exact — `pixelate`
 * and `halftone` are inert only once their cell is finer than the pixel grid
 * they land on, so their neutral is expressed relative to a 1920-wide frame.
 * They are marked below rather than quietly rounded into the exact set.
 */

/** Each effect's neutral form: the setting at which it draws nothing. */
const NEUTRAL: Record<string, () => EffectChain> = {
    blur: () => Effects.blur(0),
    directionalBlur: () => Effects.directionalBlur(0),
    grayscale: () => Effects.grayscale(0),
    bulge: () => Effects.bulge(0),
    magnify: () => Effects.magnify(1),
    bloom: () => Effects.bloom({ intensity: 0 }),
    vintage: () => Effects.vintage({ amount: 0, warmth: 0 }),
    chromaticAberration: () => Effects.chromaticAberration(0),
    invert: () => Effects.invert(0),
    scatter: () => Effects.scatter(0),
    posterize: () => Effects.posterize(255),
    motionBlur: () => Effects.motionBlur(0),
    outline: () => Effects.outline(0),
    // Nowhere to fall, no softness and no growth: the silhouette sits exactly
    // under the content it was cast from, so nothing of it is ever visible.
    dropShadow: () => Effects.dropShadow({ offsetX: 0, offsetY: 0, blur: 0, spread: 0 }),
    vignette: () => Effects.vignette({ amount: 0 }),
    grain: () => Effects.grain({ amount: 0 }),
    sharpen: () => Effects.sharpen(0),
    edges: () => Effects.edges({ strength: 0 }),
    radialBlur: () => Effects.radialBlur(0),
    dither: () => Effects.dither({ levels: 255 }),
    duotone: () => Effects.duotone({ amount: 0 }),
    curves: () => Effects.curves({ points: [[0, 0], [1, 1]] }),
    colorAdjustment: () => Effects.colorAdjustment({ contrast: 1, saturation: 1, temperature: 0 }),
    rgbShift: () => Effects.rgbShift({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } }),
    scanlines: () => Effects.scanlines({ darkness: 0 }),
    blockDisplace: () => Effects.blockDisplace({ amount: 0 }),
    bitCrush: () => Effects.bitCrush({ amount: 0 }),
    streak: () => Effects.streak({ intensity: 0 }),
    godRays: () => Effects.godRays({ intensity: 0 }),
    oilPaint: () => Effects.oilPaint({ radius: 0 }),
    texture: () => Effects.texture({ src: 'paper.png', amount: 0 }),
    displace: () => Effects.displace({ src: 'normals.png', amount: 0 }),
    wave: () => Effects.wave({ amplitude: 0 }),
    twirl: () => Effects.twirl(0),
    progressiveBlur: () => Effects.progressiveBlur(0),
    // `segments` is discrete, so the neutral is the continuous blend, not a
    // fold count of 1 — a tween from 1 segment would snap rather than ramp.
    kaleidoscope: () => Effects.kaleidoscope({ amount: 0 }),
    trails: () => Effects.trails({ echoes: 0 }),
    // No bevel means no edge to refract or light along: every term the shader
    // adds is scaled by the bevel falloff, so `depth: 0` passes the backdrop
    // through untouched whatever the other six are set to.
    glass: () => Effects.glass({ depth: 0 }),
    // A LUT's neutral is its *mix*, not its table: at `amount: 0` the source
    // colour comes back whatever the cube holds. That is what makes a look
    // dissolvable in at all — two different cubes have no meaningful midpoint,
    // so the table cuts and only this ramps.
    lut: () => Effects.lut({ table: IDENTITY_CUBE, size: 2, amount: 0 }),
    // Resolution-relative: inert only while the cell is finer than the pixel grid.
    pixelate: () => Effects.pixelate(1920),
    halftone: () => Effects.halftone({ size: 0.5 }),
};

/**
 * The smallest cube that is the identity: every corner of the RGB unit cube
 * mapped to itself, which trilinear interpolation extends to every colour
 * between them. Red-fastest, matching {@link LutEffect.table}.
 */
const IDENTITY_CUBE = new Float32Array([
    0, 0, 0, /**/ 1, 0, 0,
    0, 1, 0, /**/ 1, 1, 0,
    0, 0, 1, /**/ 1, 0, 1,
    0, 1, 1, /**/ 1, 1, 1,
]);

/**
 * Effects with no neutral form, and why.
 *
 * Worth stating rather than leaving as a gap: when a look seems to want one of
 * these as an ingredient, that is the signal to reach for a different effect,
 * because it cannot be ramped in from nothing.
 */
const NO_NEUTRAL: Record<string, string> = {
    threshold: 'flattens colour to two tones at every level/smoothness',
    ascii: 'replaces the image with glyphs at every size',
    sksl: 'an arbitrary user shader — neutrality is the author\'s to define',
};

/** The neutral chains as `[type, effect]`, for the per-effect sweeps below. */
const NEUTRALS = Object.entries(NEUTRAL).map(([type, build]) => {
    const [effect] = build().list;
    return [type, effect] as [string, SceneEffect];
});

describe('Effect neutral forms', () => {
    it('classifies every registered effect', () => {
        const declared = [...Object.keys(NEUTRAL), ...Object.keys(NO_NEUTRAL)].sort();
        expect(declared).toEqual([...effectTypes()].sort());
    });

    it('declares no effect both ways', () => {
        const both = Object.keys(NEUTRAL).filter((type) => type in NO_NEUTRAL);
        expect(both).toEqual([]);
    });

    it.each(NEUTRALS)('%s builds the effect it claims to', (type, effect) => {
        expect(effect.type).toBe(type);
    });

    it.each(NEUTRALS)('%s does not drift when lerped onto itself', (_type, effect) => {
        // Not a fixed-point check: several effects legitimately *normalise* on the
        // first lerp — `duotone`/`outline` resolve a Color to RGBA, `motionBlur`
        // resolves its alignment to a phase, `colorAdjustment`/`vignette` fill in
        // defaults. What must hold is that this settles. A lerp that kept
        // re-resolving would drift a held effect frame after frame.
        const once = lerpEffect(effect, effect, 0.5);
        expect(lerpEffect(once, once, 0)).toEqual(once);
        expect(lerpEffect(once, once, 0.5)).toEqual(once);
        expect(lerpEffect(once, once, 1)).toEqual(once);
    });
});

describe('Effect surface classification', () => {
    it('resolves a surface for every registered effect', () => {
        for (const [type, effect] of NEUTRALS) {
            expect(['filter', 'shader'], `'${type}' has no valid surface`)
                .toContain(effectSurface(effect));
        }
    });

    it.each(NEUTRALS)('%s decides its surface without reading a tweenable field', (_type, neutral) => {
        // `surface` may be a function of the effect (see `registry.effectSurface`).
        // One that read a *numeric* field would swap the node between the filter
        // and shader render paths partway through a tween, so perturbing every
        // number on the effect must leave the classification alone.
        const surface = effectSurface(neutral);
        for (const [key, value] of Object.entries(neutral)) {
            if (typeof value !== 'number') continue;
            const perturbed = { ...neutral, [key]: value + 1 } as SceneEffect;
            expect(effectSurface(perturbed), `surface changed with '${key}'`).toBe(surface);
        }
    });

    it('lets sksl pick its surface from mode, which never tweens', () => {
        // The one effect with a function surface: a backdrop shader has to be
        // snapshotted, a foreground one composes. `mode` is a discrete authoring
        // choice rather than an animatable value, so this stays stable per node.
        const [foreground] = Effects.sksl({ shader: 'half4 main(float2 p) { return half4(1); }' }).list;
        const [backdrop] = Effects
            .sksl({ shader: 'half4 main(float2 p) { return half4(1); }', mode: 'backdrop' })
            .list;
        expect(effectSurface(foreground)).toBe('filter');
        expect(effectSurface(backdrop)).toBe('shader');
    });
});
