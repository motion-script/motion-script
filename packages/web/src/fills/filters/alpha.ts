import type { CanvasKit } from "@motion-script/canvaskit";
import type { AlphaFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

/** Scales the image's alpha channel by `value` via a 4×5 color matrix. */
export class AlphaImageFillFilter extends ImageFillFilter<AlphaFilter> {
    constructor() {
        super("alpha");
    }

    makeImageFilter(filter: AlphaFilter, ck: CanvasKit): any {
        const a = Math.max(0, Math.min(1, filter.value));
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
    }
}
