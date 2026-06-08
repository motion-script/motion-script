import type { CanvasKit } from "@motion-script/canvaskit";
import type { ExposureFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

/** Multiplies RGB channels by `value` (linear exposure scaling), alpha untouched. */
export class ExposureImageFillFilter extends ImageFillFilter<ExposureFilter> {
    constructor() {
        super("exposure");
    }

    makeImageFilter(filter: ExposureFilter, ck: CanvasKit): any {
        const v = filter.value;
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
    }
}
