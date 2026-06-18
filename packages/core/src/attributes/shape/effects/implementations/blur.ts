import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

export interface BlurEffect extends BackdropCapable {
    type: "blur";
    blur: number;
}

export const blurEffect: EffectData<BlurEffect> = {
    lerp: (from, to, t) => ({ type: "blur", blur: lerpNumber(from.blur, to.blur, t), backdrop: t < 0.5 ? from.backdrop : to.backdrop }),
    equals: (a, b) => a.blur === b.blur && a.backdrop === b.backdrop,
};
