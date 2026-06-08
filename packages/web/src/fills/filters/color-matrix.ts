import type { CanvasKit } from "@motion-script/canvaskit";
import type { ColorMatrixFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

/** Applies an arbitrary user-supplied 4×5 color matrix verbatim. */
export class ColorMatrixImageFillFilter extends ImageFillFilter<ColorMatrixFilter> {
    constructor() {
        super("colorMatrix");
    }

    makeImageFilter(filter: ColorMatrixFilter, ck: CanvasKit): any {
        const colorFilter = ck.ColorFilter.MakeMatrix(filter.matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    }
}
