import { MediaAdjustment, VideoOnlyAdjustment } from "./union";
import { effectSurface, hasEffect, lerpEffect, prepareEffect } from "../effects/registry";
import type { SceneEffect } from "../effects/union";
import type { AssetTracker } from "@/assets/tracker";

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
export type AnyFilter = MediaAdjustment | VideoOnlyAdjustment;

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
 *
 * It holds only the filters that exist *solely* as filters. Most of the roster
 * is {@link EffectAdjustment} — a scene effect applied to a fill's own pixels — and
 * those are looked up in the effects registry rather than duplicated here, so
 * `dither` interpolates the same way whether it is on a node or on an image.
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

/** True when `type` has a registered `FilterData` handler, here or in the effects registry. */
export function hasFilter(type: string): boolean {
    return FILTERS.has(type) || hasEffect(type);
}

/**
 * Interpolate between two individual filters at progress `t`.
 * Falls back to a hard cut at t = 0.5 when the types differ or are unregistered.
 *
 * A type with no dedicated `FilterData` is an {@link EffectAdjustment}, so it is
 * handed to `lerpEffect` — one interpolation per effect, whether it is animated
 * on a node or inside a fill.
 */
export function lerpFilter(from: AnyFilter, to: AnyFilter, t: number): AnyFilter {
    if (from.type !== to.type) return t < 0.5 ? from : to;
    const data = FILTERS.get(from.type);
    if (data) return data.lerp(from, to, t);
    return lerpEffect(from as SceneEffect, to as SceneEffect, t) as AnyFilter;
}

/**
 * Let `filter` declare the assets it needs at the current frame, so they are
 * loaded before it renders.
 *
 * The filters defined here reference nothing, but an {@link EffectAdjustment} can —
 * `texture` and `displace` sample an image, `ascii` bakes a glyph atlas — and
 * without this the backend's synchronous lookup returns nothing, which the
 * effect can only read as "no texture". Called from the image/video fills'
 * `prepare`, alongside their own `requestImage`.
 */
export function prepareFilter(
    filter: AnyFilter,
    tracker: AssetTracker,
    width: number,
    height: number,
): void {
    if (FILTERS.has(filter.type)) return;
    prepareEffect(filter as SceneEffect, tracker, width, height);
}

/**
 * How a backend must realise `filter` — `"shader"` when it resamples pixel
 * positions and therefore has to wrap the fill's shader rather than compose
 * into its `ImageFilter` chain. The filters defined here are all `"filter"`;
 * an {@link EffectAdjustment} answers with its effect's own declaration.
 */
export function filterSurface(filter: AnyFilter): "filter" | "shader" {
    if (FILTERS.has(filter.type)) return "filter";
    // A filter is applied to the fill's own pixels, so it is never a backdrop
    // effect however the underlying effect's `mode` predicate reads.
    return effectSurface({ ...filter, mode: "foreground" } as SceneEffect);
}

/**
 * {@link lerpFilterArray} over two *optional* arrays, answering `undefined`
 * when neither side has a filter.
 *
 * A media fill's `lerp` is spread over the whole fill (`{...a, ...lerp(a,b,t)}`),
 * so returning `[]` for the overwhelmingly common no-filter case would allocate
 * a fresh array per fill per frame and turn an absent field into a present one.
 */
export function lerpOptionalFilters<T extends AnyFilter>(
    from: T[] | undefined,
    to: T[] | undefined,
    t: number,
): T[] | undefined {
    if (!from?.length && !to?.length) return undefined;
    return lerpFilterArray(from ?? [], to ?? [], t) as T[];
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
