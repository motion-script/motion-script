import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

export interface GrayScaleEffect extends BackdropCapable {
    type: "grayscale";
    amount: number;
}

export const grayscaleEffect: EffectData<GrayScaleEffect> = {
    lerp: (from, to, t) => ({ type: "grayscale", amount: lerpNumber(from.amount, to.amount, t), backdrop: t < 0.5 ? from.backdrop : to.backdrop }),
    equals: (a, b) => a.amount === b.amount && a.backdrop === b.backdrop,
};
