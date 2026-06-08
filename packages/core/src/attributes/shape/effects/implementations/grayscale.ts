import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface GrayScaleEffect {
    type: "grayscale";
    amount: number;
}

export const grayscaleEffect: EffectData<GrayScaleEffect> = {
    lerp: (from, to, t) => ({ type: "grayscale", amount: lerpNumber(from.amount, to.amount, t) }),
    equals: (a, b) => a.amount === b.amount,
};
