import type { CanvasKit } from "@motion-script/canvaskit";
import type { MediaFilter } from "@motion-script/core";

/**
 * Abstract base for per-filter-type image-fill filters.
 *
 * Subclasses build a Skia ImageFilter from a filter spec. Filters are composed
 * in array order (index 0 is innermost — applied first to the image content)
 * and attached to the paint via setImageFilter when drawing the fill.
 */
export abstract class ImageFillFilter<T extends MediaFilter = MediaFilter> {
    readonly type: string;

    constructor(type: string) {
        this.type = type;
    }

    abstract makeImageFilter(filter: T, ck: CanvasKit): any;

    /** Release any persistent CanvasKit objects held by this filter. */
    dispose(): void { }
}
