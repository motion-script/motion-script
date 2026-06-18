import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

export interface ChromaticAberrationEffect extends BackdropCapable {
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
        backdrop: t < 0.5 ? from.backdrop : to.backdrop,
    }),
    equals: (a, b) => a.amount === b.amount && a.angle === b.angle && a.backdrop === b.backdrop,
};
