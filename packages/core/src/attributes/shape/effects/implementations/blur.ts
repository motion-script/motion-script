import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface BlurEffect extends ModedEffect {
    type: "blur";
    blur: number;
}

export const blurEffect: EffectData<BlurEffect> = {
    lerp: (from, to, t) => ({ type: "blur", blur: lerpNumber(from.blur, to.blur, t), mode: t < 0.5 ? from.mode : to.mode }),
    equals: (a, b) => a.blur === b.blur && a.mode === b.mode,
};
