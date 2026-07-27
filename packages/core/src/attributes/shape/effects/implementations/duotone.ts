import { lerpNumber } from "@/tween/lerp";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { ModedEffect, EffectData } from "../effect-data";
import { resolveEffectColor, sameEffectColor } from "../effect-data";

/**
 * Duotone / gradient map — remap the content's luminance onto a two-colour ramp,
 * so black becomes `shadows`, white becomes `highlights`, and everything between
 * interpolates. Chroma in the source is discarded; only its brightness survives.
 *
 * The editorial two-colour treatment (Spotify covers, risograph posters) and the
 * general "tint a photo to brand colours" tool, both from one pair of colours.
 */
export interface DuotoneEffect extends ModedEffect {
    type: "duotone";
    /** 0–1 blend from the original colours (0) to the full ramp (1). */
    amount: number;
    /** Colour the darkest tones map to. */
    shadows: Color;
    /** Colour the brightest tones map to. */
    highlights: Color;
}

export const duotoneEffect: EffectData<DuotoneEffect> = {
    lerp: (from, to, t) => ({
        type: "duotone",
        amount: lerpNumber(from.amount, to.amount, t),
        shadows: lerpColor(resolveEffectColor(from.shadows), resolveEffectColor(to.shadows), t),
        highlights: lerpColor(resolveEffectColor(from.highlights), resolveEffectColor(to.highlights), t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amount === b.amount &&
        sameEffectColor(a.shadows, b.shadows) &&
        sameEffectColor(a.highlights, b.highlights) &&
        a.mode === b.mode,
    // A luminance ramp is a plain affine colour transform, so it composes as an
    // ImageFilter (the default surface) rather than needing a shader scope.
};
