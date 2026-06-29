import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface ChromaticAberrationEffect extends ModedEffect {
    type: "chromaticAberration";
    /** Pixel offset distance for the R/B channel fringe. */
    amount: number;
    /** Angle in degrees — 0 = horizontal split (R left, B right). */
    angle: number;
}

export const chromaticAberrationEffect: EffectData<ChromaticAberrationEffect> = {
    lerp: (from, to, t) => ({
        type: "chromaticAberration",
        amount: lerpNumber(from.amount, to.amount, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.amount === b.amount && a.angle === b.angle && a.mode === b.mode,
};
