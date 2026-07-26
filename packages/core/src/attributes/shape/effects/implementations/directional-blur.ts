import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Motion-blur-style directional (linear) blur. Unlike {@link BlurEffect}, which
 * blurs uniformly in all directions, this smears the node's own content along a
 * single axis.
 */
export interface DirectionalBlurEffect extends ModedEffect {
    type: "directionalBlur";
    /** Smear length in pixels along `angle`. */
    radius: number;
    /** Angle in degrees of the smear axis — 0 = horizontal, 90 = vertical. */
    angle: number;
}

export const directionalBlurEffect: EffectData<DirectionalBlurEffect> = {
    lerp: (from, to, t) => ({
        type: "directionalBlur",
        radius: lerpNumber(from.radius, to.radius, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.radius === b.radius && a.angle === b.angle && a.mode === b.mode,
};
