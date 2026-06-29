import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface GrayScaleEffect extends ModedEffect {
    type: "grayscale";
    amount: number;
}

export const grayscaleEffect: EffectData<GrayScaleEffect> = {
    lerp: (from, to, t) => ({ type: "grayscale", amount: lerpNumber(from.amount, to.amount, t), mode: t < 0.5 ? from.mode : to.mode }),
    equals: (a, b) => a.amount === b.amount && a.mode === b.mode,
};
