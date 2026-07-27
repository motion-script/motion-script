import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Anamorphic glare — a bright pass smeared along one axis and screened back on.
 *
 * Where `bloom` spreads light equally in all directions, this spreads it along
 * `angle` only. That asymmetry is the entire anamorphic look: the horizontal
 * flare a wide lens throws off a highlight, rather than a halo around it.
 */
export interface StreakEffect extends ModedEffect {
    type: "streak";
    /** Additive multiplier for the streak pass. 0 = off. */
    intensity: number;
    /** 0–1 luminance cutoff — only pixels brighter than this streak. */
    threshold: number;
    /** Smear length in px along `angle`. */
    length: number;
    /** Smear axis in degrees; 0 = horizontal. */
    angle: number;
}

export const streakEffect: EffectData<StreakEffect> = {
    lerp: (from, to, t) => ({
        type: "streak",
        intensity: lerpNumber(from.intensity, to.intensity, t),
        threshold: lerpNumber(from.threshold, to.threshold, t),
        length: lerpNumber(from.length, to.length, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.intensity === b.intensity &&
        a.threshold === b.threshold &&
        a.length === b.length &&
        a.angle === b.angle &&
        a.mode === b.mode,
    // An anisotropic blur of a colour-matrix bright pass — all ImageFilter work.
};
