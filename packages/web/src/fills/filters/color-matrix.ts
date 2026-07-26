import type { EffectHandler } from "../../effects/handler";
import type { ColorMatrixFilter } from "@motion-script/core";

/** Applies an arbitrary user-supplied 4×5 color matrix verbatim. */
export const colorMatrixEffectHandler: EffectHandler<ColorMatrixFilter> = {
    type: "colorMatrix",

    makeImageFilter(effect, ck) {
        const colorFilter = ck.ColorFilter.MakeMatrix(effect.matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    },
};
