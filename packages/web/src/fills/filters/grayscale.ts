import type { CanvasKit } from "@motion-script/canvaskit";
import type { GrayscaleFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

// ITU-R BT.709 luminance weights
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/** Desaturates toward BT.709 luminance, blended with the original by `value`. */
export class GrayscaleImageFillFilter extends ImageFillFilter<GrayscaleFilter> {
    constructor() {
        super("grayscale");
    }

    makeImageFilter(filter: GrayscaleFilter, ck: CanvasKit): any {
        const a = Math.max(0, Math.min(1, filter.value));
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
    }
}
