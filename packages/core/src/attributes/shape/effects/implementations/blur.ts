import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface BlurEffect {
    type: "blur";
    radius: number;
}

export const blurEffect: EffectData<BlurEffect> = {
    lerp: (from, to, t) => ({ type: "blur", radius: lerpNumber(from.radius, to.radius, t) }),
    equals: (a, b) => a.radius === b.radius,
};
