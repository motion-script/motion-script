import type { EffectHandler } from "../../effects/handler";
import type { ExposureFilter } from "@motion-script/core";

/** Multiplies RGB channels by `value` (linear exposure scaling), alpha untouched. */
export const exposureEffectHandler: EffectHandler<ExposureFilter> = {
    type: "exposure",

    makeImageFilter(effect, ck) {
        const v = effect.amount;
        // Scale RGB channels by `value`, preserve alpha.
        const matrix = [
            v, 0, 0, 0, 0,
            0, v, 0, 0, 0,
            0, 0, v, 0, 0,
            0, 0, 0, 1, 0,
        ];
        const colorFilter = ck.ColorFilter.MakeMatrix(matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    },
};
