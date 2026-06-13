import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

export interface BlurEffect extends BackdropCapable {
    type: "blur";
    radius: number;
}

export const blurEffect: EffectData<BlurEffect> = {
    lerp: (from, to, t) => ({ type: "blur", radius: lerpNumber(from.radius, to.radius, t), backdrop: t < 0.5 ? from.backdrop : to.backdrop }),
    equals: (a, b) => a.radius === b.radius && a.backdrop === b.backdrop,
};
