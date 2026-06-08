import type { CanvasKit } from "@motion-script/canvaskit";
import type { BlurFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

/** Gaussian blur; `value` is halved to map the spec's units to Skia's sigma. */
export class BlurImageFillFilter extends ImageFillFilter<BlurFilter> {
    constructor() {
        super("blur");
    }

    makeImageFilter(filter: BlurFilter, ck: CanvasKit): any {
        const sigma = filter.value / 2;
        return ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null);
    }
}
