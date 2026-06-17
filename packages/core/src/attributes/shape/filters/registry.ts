import { MediaFilter, VideoMediaFilter } from "./union";

import { exposureFilter } from "./implementations/exposure";
import { blurFilter } from "./implementations/blur";
import { grayscaleFilter } from "./implementations/grayscale";
import { alphaFilter } from "./implementations/alpha";
import { colorMatrixFilter } from "./implementations/color-matrix";
import { curvesFilter } from "./implementations/curves";
import { colorAdjustmentFilter } from "./implementations/color-adjustment";
import { posterizeTimeFilter } from "./implementations/posterize-time";
import { echoFilter } from "./implementations/echo";

/** Any concrete filter object accepted on a media fill — pixel or video-only. */
export type AnyFilter = MediaFilter | VideoMediaFilter;

/** Interpolation and equality contract every filter implementation must implement. */
export interface FilterData<T extends AnyFilter> {
    /** Return a new filter linearly interpolated between `from` and `to` at progress `t` (0–1). */
    lerp(from: T, to: T, t: number): T;
    /** Return true when both filters are visually identical (used to skip redundant redraws). */
    equals(a: T, b: T): boolean;
}

/**
 * Maps each filter `type` to its `FilterData` handler. Statically imported
 * constants (no runtime registration step), mirroring the `FILLS` map in the
 * fill registry — so the table is always populated and there is no side-effect
 * import to forget.
 */
const FILTERS = new Map<string, FilterData<AnyFilter>>([
    ["exposure", exposureFilter as FilterData<AnyFilter>],
    ["blur", blurFilter as FilterData<AnyFilter>],
    ["grayscale", grayscaleFilter as FilterData<AnyFilter>],
    ["alpha", alphaFilter as FilterData<AnyFilter>],
    ["colorMatrix", colorMatrixFilter as FilterData<AnyFilter>],
    ["curves", curvesFilter as FilterData<AnyFilter>],
    ["colorAdjustment", colorAdjustmentFilter as FilterData<AnyFilter>],
    ["posterizeTime", posterizeTimeFilter as FilterData<AnyFilter>],
    ["echo", echoFilter as FilterData<AnyFilter>],
]);

/**
 * Video-only filter types. These are consumed by the video fill's per-frame
 * `update()` (`posterizeTime`) or a dedicated multi-pass renderer (`echo`),
 * NOT the pixel `setImageFilter` chain. `isPixelFilter` lets the web layer skip
 * them when composing the CanvasKit image filter.
 */
const VIDEO_ONLY = new Set<string>(["posterizeTime", "echo"]);

/** True when `type` is a pixel filter that composes into a CanvasKit image filter. */
export function isPixelFilter(type: string): boolean {
    return !VIDEO_ONLY.has(type);
}

/** True when `type` has a registered `FilterData` handler. */
export function hasFilter(type: string): boolean {
    return FILTERS.has(type);
}

/**
 * Interpolate between two individual filters at progress `t`.
 * Falls back to a hard cut at t = 0.5 when the types differ or are unregistered.
 */
export function lerpFilter(from: AnyFilter, to: AnyFilter, t: number): AnyFilter {
    if (from.type !== to.type) return t < 0.5 ? from : to;
    const data = FILTERS.get(from.type);
    return data ? data.lerp(from, to, t) : (t < 0.5 ? from : to);
}

/**
 * Interpolate between two filter arrays of potentially different lengths.
 * Indices present in only one array are kept as-is; matched indices are lerped pairwise.
 */
export function lerpFilterArray(from: AnyFilter[], to: AnyFilter[], t: number): AnyFilter[] {
    const maxLen = Math.max(from.length, to.length);
    const result: AnyFilter[] = [];
    for (let i = 0; i < maxLen; i++) {
        const a = from[i];
        const b = to[i];
        if (a && b) {
            result.push(lerpFilter(a, b, t));
        } else if (a) {
            result.push(a);
        } else if (b) {
            result.push(b);
        }
    }
    return result;
}
