import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface VintageEffect extends ModedEffect {
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
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.amount === b.amount && a.warmth === b.warmth && a.mode === b.mode,
};
