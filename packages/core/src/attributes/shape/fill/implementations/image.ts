import type { BlendMode } from '../blend';
import type { MediaFilter } from '../../filters/union';
import type { FillData } from '../registry';
import { lerpOptionalFilters, prepareFilter } from '../../filters/registry';

/**
 * How an image (or video frame) is scaled into its node's bounds.
 *
 * - `'fill'`   — scale uniformly to cover the bounds, cropping the overflow,
 *                keeping the image centered. The Figma-style default; no
 *                distortion, no letterboxing.
 * - `'fit'`    — scale uniformly to be fully contained, letterboxing as needed.
 * - `'tile'`   — repeat the image at its native size (× `scaling`).
 * - `'stretch'`— scale each axis independently to fill the bounds exactly,
 *                distorting the aspect ratio.
 */
export type ImageFit = 'fill' | 'fit' | 'tile' | 'stretch';
export type ImageTransform = Float32Array | number[][];

export interface ImageFillProp {
    type: 'image';
    src: string;
    /** How the image is scaled into the node's bounds. Defaults to `'fill'`. */
    fit?: ImageFit;
    /** @deprecated Alias for {@link ImageFillProp.fit}. */
    mode?: ImageFit;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

export interface ImageFillResolved {
    type: 'image';
    src: string;
    mode?: ImageFit;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

export const imageFill: FillData<ImageFillResolved> = {
    // Author-facing props expose the fit mode as `fit`; the resolved shape (and
    // the renderer) read it as `mode`. Accept either so a prop built directly
    // (`{ type: 'image', fit }`) or via the chain (`mode`) both resolve correctly.
    resolve: ({ fit, mode, ...prop }: ImageFillProp) => ({
        ...prop,
        mode: mode ?? fit,
    }),
    lerp: (a, b, t) => ({
        src: t < 0.5 ? a.src : b.src,
        mode: a.mode ?? b.mode,
        transform: a.transform ?? b.transform,
        scaling: a.scaling ?? b.scaling,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
        // Filters animate with the fill. Leaving them out let `lerpFill`'s
        // `{...a, ...lerp()}` spread carry the *from* fill's filters for the
        // whole tween, so tweening a fill from `grayscale(0)` to `grayscale(1)`
        // did nothing until the signal snapped to the target at the end.
        filters: lerpOptionalFilters(a.filters, b.filters, t),
    }),
    equals: (a, b) => a.src === b.src,
    prepare: (fill, manager, width, height) => {
        manager.requestImage(fill.src, width, height);
        // A filter can reference an asset of its own — `texture` and `displace`
        // sample an image, `ascii` bakes a glyph atlas — and the backend's
        // lookup is synchronous, so an unrequested one just reads as "no
        // texture" and the filter silently no-ops.
        for (const filter of fill.filters ?? []) prepareFilter(filter, manager, width, height);
    },
};
