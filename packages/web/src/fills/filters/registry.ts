import type { CanvasKit } from "@motion-script/canvaskit";
import type { MediaFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";
import { ExposureImageFillFilter } from "./exposure";
import { BlurImageFillFilter } from "./blur";
import { GrayscaleImageFillFilter } from "./grayscale";
import { AlphaImageFillFilter } from "./alpha";
import { ColorMatrixImageFillFilter } from "./color-matrix";
import { CurvesImageFillFilter } from "./curves";
import { ColorAdjustmentImageFillFilter } from "./color-adjustment";

export class ImageFillFilterRegistry {
    private static readonly list: ImageFillFilter[] = [
        new ExposureImageFillFilter(),
        new BlurImageFillFilter(),
        new GrayscaleImageFillFilter(),
        new AlphaImageFillFilter(),
        new ColorMatrixImageFillFilter(),
        new CurvesImageFillFilter(),
        new ColorAdjustmentImageFillFilter(),
    ];

    static get(type: string): ImageFillFilter | undefined {
        return this.list.find((filter) => filter.type === type);
    }

    static makeImageFilter(filter: MediaFilter, ck: CanvasKit): any {
        const handler = this.get(filter.type);
        if (!handler) return null;
        return handler.makeImageFilter(filter as any, ck);
    }

    /**
     * Compose filters into a single MediaFilter chain applied in array order
     * (index 0 is innermost — applied first to the image content). Filter order
     * matters: e.g. blur-then-grayscale ≠ grayscale-then-blur.
     */
    static compose(filters: MediaFilter[], ck: CanvasKit): any | null {
        let composed: any = null;
        for (const filter of filters) {
            const made = this.makeImageFilter(filter, ck);
            if (made == null) continue;
            composed = composed === null
                ? made
                : ck.ImageFilter.MakeCompose(made, composed);
        }
        return composed;
    }

    static disposeAll(): void {
        for (const handler of this.list) {
            handler.dispose();
        }
    }
}
