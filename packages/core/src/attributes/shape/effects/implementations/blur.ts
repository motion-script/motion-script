import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface BlurEffect extends ModedEffect {
    type: "blur";
    /** Blur spread in pixels. */
    radius: number;
}

export const blurEffect: EffectData<BlurEffect> = {
    lerp: (from, to, t) => ({ type: "blur", radius: lerpNumber(from.radius, to.radius, t), mode: t < 0.5 ? from.mode : to.mode }),
    equals: (a, b) => a.radius === b.radius && a.mode === b.mode,
};
