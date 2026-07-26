import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface GrayscaleEffect extends ModedEffect {
    type: "grayscale";
    /** 0–1: blend from original (0) to fully desaturated (1). */
    amount: number;
}

export const grayscaleEffect: EffectData<GrayscaleEffect> = {
    lerp: (from, to, t) => ({ type: "grayscale", amount: lerpNumber(from.amount, to.amount, t), mode: t < 0.5 ? from.mode : to.mode }),
    equals: (a, b) => a.amount === b.amount && a.mode === b.mode,
};
