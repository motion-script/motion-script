import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface BloomEffect {
    type: "bloom";
    /** 0–1: luminance cutoff — pixels below this threshold don't contribute to the bloom. */
    threshold: number;
    /** Blur spread radius in pixels. */
    radius: number;
    /** Additive multiplier for the bloom pass (default 1). */
    intensity: number;
}

export const bloomEffect: EffectData<BloomEffect> = {
    lerp: (from, to, t) => ({
        type: "bloom",
        threshold: lerpNumber(from.threshold, to.threshold, t),
        radius: lerpNumber(from.radius, to.radius, t),
        intensity: lerpNumber(from.intensity, to.intensity, t),
    }),
    equals: (a, b) => a.threshold === b.threshold && a.radius === b.radius && a.intensity === b.intensity,
};
