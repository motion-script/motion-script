import { type GrayscaleEffect, type GrayscaleFilter } from "@motion-script/core";
import type { EffectHandler } from "./handler";

// ITU-R BT.709 luminance weights
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * Desaturation via a single colour-matrix ImageFilter, lerped between identity
 * (amount=0) and full BT.709 luminance grayscale (amount=1).
 *
 * Serves both the scene effect and the image/video-fill filter — since the field
 * unification both are `{ type: 'grayscale', amount }` with identical maths.
 */
export const grayscaleEffectHandler: EffectHandler<GrayscaleEffect | GrayscaleFilter> = {
    type: "grayscale",

    makeImageFilter(effect, ck) {
        const a = Math.max(0, Math.min(1, effect.amount));

        // 4×5 row-major color matrix (Skia format):
        // [R'] = [r0..r4] * [R, G, B, A, 1]
        // Interpolates between identity (a=0) and full luminance grayscale (a=1).
        const matrix = [
            1 - a + a * LR, a * LG, a * LB, 0, 0,
            a * LR, 1 - a + a * LG, a * LB, 0, 0,
            a * LR, a * LG, 1 - a + a * LB, 0, 0,
            0, 0, 0, 1, 0,
        ];

        const colorFilter = ck.ColorFilter.MakeMatrix(matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    },
};
