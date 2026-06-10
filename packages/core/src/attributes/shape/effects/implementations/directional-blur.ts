import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

/**
 * Motion-blur-style directional (linear) blur. Unlike {@link BlurEffect}, which
 * blurs uniformly in all directions, this smears the node's own content along a
 * single axis.
 */
export interface DirectionalBlurEffect {
    type: "directionalBlur";
    /** Angle in degrees of the smear axis — 0 = horizontal, 90 = vertical. */
    direction: number;
    /** Smear length in pixels along `direction`. */
    blurLength: number;
}

export const directionalBlurEffect: EffectData<DirectionalBlurEffect> = {
    lerp: (from, to, t) => ({
        type: "directionalBlur",
        direction: lerpNumber(from.direction, to.direction, t),
        blurLength: lerpNumber(from.blurLength, to.blurLength, t),
    }),
    equals: (a, b) => a.direction === b.direction && a.blurLength === b.blurLength,
};
