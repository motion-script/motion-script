import { lerpNumber } from "@/tween/lerp";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { ModedEffect, EffectData } from "../effect-data";
import { resolveEffectColor, sameEffectColor } from "../effect-data";

/**
 * Darkened corners — the lens falloff every photo grade reaches for.
 *
 * The node box is normalised to a unit ellipse, so the falloff follows the
 * node's aspect ratio rather than an off-centre circle. Everything inside
 * `radius` is untouched; from there to `radius + softness` the tint ramps in
 * with a smoothstep, reaching `amount` at the corners.
 */
export interface VignetteEffect extends ModedEffect {
    type: "vignette";
    /** 0–1 tint strength at the very edge. 0 = off. */
    amount: number;
    /** 0–1 normalised radius where the falloff starts (1 ≈ the box corners). */
    radius: number;
    /** 0–1 width of the ramp; 0 is a hard ring, 1 a long gradient. */
    softness: number;
    /** Tint colour — black darkens (the classic look), white blows the edges out. */
    color: Color;
}

export const vignetteEffect: EffectData<VignetteEffect> = {
    lerp: (from, to, t) => ({
        type: "vignette",
        amount: lerpNumber(from.amount, to.amount, t),
        radius: lerpNumber(from.radius, to.radius, t),
        softness: lerpNumber(from.softness, to.softness, t),
        color: lerpColor(resolveEffectColor(from.color), resolveEffectColor(to.color), t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amount === b.amount &&
        a.radius === b.radius &&
        a.softness === b.softness &&
        sameEffectColor(a.color, b.color) &&
        a.mode === b.mode,
    // Needs each pixel's position within the node box to compute its falloff.
    surface: "shader",
};
