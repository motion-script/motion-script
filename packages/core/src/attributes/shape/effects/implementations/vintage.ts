import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

export interface VintageEffect extends BackdropCapable {
    type: "vintage";
    /** 0–1: blend from original (0) to full sepia/desaturate (1). */
    amount: number;
    /** -1…1: negative = cool/cyan tint, positive = warm/orange tint. */
    warmth: number;
}

export const vintageEffect: EffectData<VintageEffect> = {
    lerp: (from, to, t) => ({
        type: "vintage",
        amount: lerpNumber(from.amount, to.amount, t),
        warmth: lerpNumber(from.warmth, to.warmth, t),
        backdrop: t < 0.5 ? from.backdrop : to.backdrop,
    }),
    equals: (a, b) => a.amount === b.amount && a.warmth === b.warmth && a.backdrop === b.backdrop,
};
