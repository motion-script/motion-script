import type { EffectHandler } from "../../effects/handler";
import type { AlphaFilter } from "@motion-script/core";

/** Scales the image's alpha channel by `value` via a 4×5 color matrix. */
export const alphaEffectHandler: EffectHandler<AlphaFilter> = {
    type: "alpha",

    makeImageFilter(effect, ck) {
        const a = Math.max(0, Math.min(1, effect.amount));
        const matrix = [
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, a, 0,
        ];
        const colorFilter = ck.ColorFilter.MakeMatrix(matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    },
};
