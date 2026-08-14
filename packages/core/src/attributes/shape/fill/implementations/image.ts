import type { BlendMode } from '../blend';
import type { MediaFilter } from '../../filters/union';
import type { FillData } from '../registry';
import { lerpOptionalFilters, prepareFilter } from '../../filters/registry';
import { Anchor, resolveAnchor } from '@/attributes/layout/anchor';
import { Insets, InsetsResolved, resolveInsets } from '@/attributes/layout/insets';
import { Vector2, lerpVector2 } from '@/attributes/layout/vector2';
import { lerpInsets } from '@/layout/tweens';
import { lerpNumber } from '@/tween/lerp';

/**
 * How an image (or video frame) is scaled into its node's bounds.
 *
 * - `'fill'`   — scale uniformly to cover the bounds, cropping the overflow.
 *                The Figma-style default; no distortion, no letterboxing.
 * - `'fit'`    — scale uniformly to be fully contained, letterboxing as needed.
 * - `'tile'`   — repeat the image at its native size (× `zoom`).
 * - `'stretch'`— scale each axis independently to fill the bounds exactly,
 *                distorting the aspect ratio.
 */
export type ImageFit = 'fill' | 'fit' | 'tile' | 'stretch';

/**
 * A raw image→shape matrix (3×3, row-major) as a 9-element `Float32Array` or a
 * 3×3 nested array. The escape hatch: see {@link ImageFillProp.matrix}.
 */
export type ImageMatrix = Float32Array | number[][];

/**
 * A rectangular window onto the source, as **fractions of the source's own
 * size** (0–1) inset from each edge: `{ left: 0.25 }` discards the left quarter.
 *
 * Fractions rather than pixels so a crop is resolution-independent — the same
 * value reads identically at 1× and 4K, and survives swapping `src` for a
 * differently-sized asset. Everything downstream (`fit`, `zoom`, `anchor`) then
 * treats the cropped window *as if it were the whole image*, so a crop composes
 * with the fit modes instead of fighting them.
 *
 * Reuses the {@link Insets} shape, so the shorthands come free — and so do
 * `resolveInsets`/`lerpInsets`, which is what makes a crop tween:
 * `0.1` · `{ horizontal: 0.2 }` · `{ left: 0.1, top: 0.05 }`.
 */
export type ImageCrop = Insets;

export interface ImageFillProp {
    type: 'image';
    src: string;

    /** How the (cropped) image is scaled into the node's bounds. Defaults to `'fill'`. */
    fit?: ImageFit;

    /**
     * Window onto the source, applied **before** `fit` — see {@link ImageCrop}.
     *
     * Not honoured by `fit: 'tile'`: the shader repeats the whole texture, so
     * there is no way to tile a sub-rect of it.
     */
    crop?: ImageCrop;

    /**
     * Magnification applied **on top of** whatever `fit` resolved. `1` (the
     * default) is the fitted size, `2` twice that, `0.5` half.
     *
     * A multiplier rather than an absolute scale so it stays meaningful under
     * every mode and at any node size: `zoom: 2` means "twice as big as it would
     * otherwise be" whether the fit was cover, contain or native tiling. Under
     * `'tile'` the fitted scale is 1 (native size), so `zoom` there is the tile
     * size multiplier.
     */
    zoom?: number;

    /**
     * The point held fixed as `zoom` scales, and the alignment of the image
     * inside the bounds when it doesn't cover them. Defaults to `'center'`.
     *
     * The same `[-1, 1]` y-up space as `pivot`/`align` (so `'topLeft'`,
     * `'centerRight'` and `{ x, y }` all work, through the same `resolveAnchor`).
     * The named point of the source lands on the same named point of the box:
     * `anchor: 'topLeft'` pins the source's top-left corner to the box's, so
     * zooming grows away from it. At the default centre this reproduces the
     * classic centred cover/contain placement exactly.
     *
     * Ignored by `'tile'` (a repeating texture has no corner to pin) and inert
     * under `'stretch'` at `zoom: 1` (the image already fills both axes).
     */
    anchor?: Anchor;

    /**
     * Raw image→shape matrix. The escape hatch: it wins outright, bypassing
     * `crop`/`fit`/`zoom`/`anchor` **and** the shape bounds, so it must carry the
     * translation itself. Named `matrix` rather than `transform` because a node's
     * `transform` is its x/y/scale/rotation; this is specifically the 3×3 that
     * maps image pixels into the shape's local space.
     */
    matrix?: ImageMatrix;

    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

export interface ImageFillResolved {
    type: 'image';
    src: string;
    fit?: ImageFit;
    /** Fractional insets, all four sides present. */
    crop?: InsetsResolved;
    zoom?: number;
    /** Normalised `[-1, 1]` y-up point. */
    anchor?: Vector2;
    matrix?: ImageMatrix;
    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

/** Zero crop — the whole source. Shared by the lerp when only one side crops. */
const NO_CROP: InsetsResolved = { left: 0, right: 0, top: 0, bottom: 0 };
/** The default anchor, resolved. */
const CENTER: Vector2 = { x: 0, y: 0 };

/**
 * Normalise the loose author-facing shapes once, so the backend's matrix builder
 * reads plain resolved values (`crop` always four sides, `anchor` always a
 * vector) rather than re-deriving them per frame.
 */
/** @internal */
export function resolveImagePlacement(
    prop: { crop?: ImageCrop; anchor?: Anchor },
): { crop?: InsetsResolved; anchor?: Vector2 } {
    return {
        crop: prop.crop === undefined ? undefined : resolveInsets(prop.crop),
        anchor: prop.anchor === undefined ? undefined : resolveAnchor(prop.anchor),
    };
}

/**
 * Interpolate the placement props shared by the image and video fills. Kept in
 * one place so the two fills cannot drift — they describe the same geometry and
 * are consumed by the same `computeImageMatrix`.
 */
/** @internal */
export function lerpImagePlacement(
    a: { crop?: InsetsResolved; zoom?: number; anchor?: Vector2; matrix?: ImageMatrix },
    b: { crop?: InsetsResolved; zoom?: number; anchor?: Vector2; matrix?: ImageMatrix },
    t: number,
): { crop?: InsetsResolved; zoom: number; anchor: Vector2; matrix?: ImageMatrix } {
    return {
        // A raw matrix is not interpolable geometry — it snaps, and authors who
        // want a moving matrix bind the prop to a signal instead.
        matrix: a.matrix ?? b.matrix,
        // Stay `undefined` when neither side crops, so an uncropped fill keeps
        // taking the cheap path and reads back as it was authored.
        crop: a.crop || b.crop ? lerpInsets(a.crop ?? NO_CROP, b.crop ?? NO_CROP, t) : undefined,
        zoom: lerpNumber(a.zoom ?? 1, b.zoom ?? 1, t),
        anchor: lerpVector2(a.anchor ?? CENTER, b.anchor ?? CENTER, t),
    };
}

export const imageFill: FillData<ImageFillResolved> = {
    // `crop`/`anchor` are destructured out before the spread: an optional prop
    // re-added by a later spread widens to a *union* of both types, so leaving
    // them in would type the resolved crop as `ImageCrop | InsetsResolved`.
    resolve: ({ crop, anchor, ...prop }: ImageFillProp): ImageFillResolved => ({
        ...prop,
        ...resolveImagePlacement({ crop, anchor }),
    }),
    lerp: (a, b, t) => ({
        src: t < 0.5 ? a.src : b.src,
        fit: a.fit ?? b.fit,
        ...lerpImagePlacement(a, b, t),
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
        // Filters animate with the fill. Leaving them out let `lerpFill`'s
        // `{...a, ...lerp()}` spread carry the *from* fill's filters for the
        // whole tween, so tweening a fill from `grayscale(0)` to `grayscale(1)`
        // did nothing until the signal snapped to the target at the end.
        filters: lerpOptionalFilters(a.filters, b.filters, t),
    }),
    equals: (a, b) => a.src === b.src,
    prepare: (fill, manager, width, height) => {
        manager.addImage(fill.src, { width, height });
        // A filter can reference an asset of its own — `texture` and `displace`
        // sample an image, `ascii` bakes a glyph atlas — and the backend's
        // lookup is synchronous, so an unrequested one just reads as "no
        // texture" and the filter silently no-ops.
        for (const filter of fill.filters ?? []) prepareFilter(filter, manager, width, height);
    },
};
