import { MediaFilter, VideoMediaFilter } from "./union";
import type { BlendMode } from "../fill/blend";
import type { ColorAdjustmentFilter } from "./implementations/color-adjustment";
import type { CurvesChannel } from "./implementations/curves";

/** Any concrete filter a chain may hold — pixel or video-only. */
type AnyFilter = MediaFilter | VideoMediaFilter;

/**
 * Media filters follow the same one-argument rule as scene effects: every
 * builder takes a single options object, and those with one dominant scalar
 * also accept that scalar directly. Field names are the shared vocabulary —
 * `radius` for a pixel distance, `amount` for a 0–1 intensity — so
 * `ImageFilters.blur(8)` and `Effects.blur(8)` describe the same quantity.
 */

/** Gaussian blur. Scalar shorthand sets `radius`. */
export interface BlurFilterOptions {
    /** Blur radius in pixels. */
    radius: number;
}

/** Desaturation. Scalar shorthand sets `amount`. */
export interface GrayscaleFilterOptions {
    /** 0 = original, 1 = fully grayscale. */
    amount: number;
}

/** Alpha (opacity) multiply. Scalar shorthand sets `amount`. */
export interface AlphaFilterOptions {
    /** 0 = fully transparent, 1 = unchanged. */
    amount: number;
}

/** Luminance scale. Scalar shorthand sets `amount`. */
export interface ExposureFilterOptions {
    /** Exposure multiplier. 1 = unchanged, >1 brighter, <1 darker. */
    amount: number;
}

/** Raw 4×5 row-major colour matrix. Array shorthand sets `matrix`. */
export interface ColorMatrixFilterOptions {
    /** 4×5 row-major colour matrix in Skia format. */
    matrix: number[];
}

/** Tone curve through control points. */
export interface CurvesFilterOptions {
    /** Curve control points as [input, output] pairs in [0, 1]. */
    points: [number, number][];
    /** Channel(s) to apply the curve to (default `'rgb'`). */
    channel?: CurvesChannel;
}

/** Photographic tonal/colour adjustments. All fields optional. */
export type ColorAdjustmentFilterOptions = Omit<ColorAdjustmentFilter, 'type'>;

/** Stop-motion frame-rate resample (video only). Scalar shorthand sets `fps`. */
export interface PosterizeTimeFilterOptions {
    /** Target frame rate the source playhead snaps to. */
    fps: number;
}

/** Motion-trail echo of past frames (video only). */
export interface EchoFilterOptions {
    /** Number of past-frame taps drawn behind the current frame. */
    echoes: number;
    /** Delay between successive taps, in source seconds. */
    delay: number;
    /** Per-tap alpha multiplier; tap `n` is drawn at `decay ** n` (default 0.5). */
    decay?: number;
    /** Blend mode used to composite the echo taps (default `'screen'`). */
    blend?: BlendMode;
}

/** Normalise a `number | Options` filter argument onto its dominant field. */
function scalarFilter<O extends object>(arg: number | O, key: keyof O): O {
    return typeof arg === "number" ? ({ [key]: arg } as O) : arg;
}

/**
 * Immutable, chainable list of media filters.
 *
 * Each builder method returns a new `FilterChain` with the filter appended,
 * so chains are safe to share and branch. The chain is intentionally permissive
 * — it can hold video-only filters (`posterizeTime`, `echo`) too; the type gate
 * for "image fills can't take video filters" lives at the fill boundary
 * (`ImageFilter` vs `VideoFilter`), mirroring how `Fill` is structured.
 *
 * @example
 * const chain = ImageFilters.blur(4).grayscale(0.5);
 * node.filters = chain; // assign directly
 * node.filters = [...chain, { type: 'alpha', amount: 0.5 }]; // spread into array
 */
export class FilterChain {
  constructor(public list: AnyFilter[] = []) { }

  private append(filter: AnyFilter): FilterChain {
    return new FilterChain([...this.list, filter]);
  }

  /** Append a Gaussian blur. */
  blur(options: number | BlurFilterOptions) {
    const { radius } = scalarFilter(options, "radius");
    return this.append({ type: 'blur', radius });
  }

  /** Append a grayscale filter. */
  grayscale(options: number | GrayscaleFilterOptions) {
    const { amount } = scalarFilter(options, "amount");
    return this.append({ type: 'grayscale', amount });
  }

  /** Append an alpha (opacity) filter. */
  alpha(options: number | AlphaFilterOptions) {
    const { amount } = scalarFilter(options, "amount");
    return this.append({ type: 'alpha', amount });
  }

  /** Append an exposure filter. */
  exposure(options: number | ExposureFilterOptions) {
    const { amount } = scalarFilter(options, "amount");
    return this.append({ type: 'exposure', amount });
  }

  /** Append a color-adjustment filter from the given partial settings. */
  colorAdjustment(options: ColorAdjustmentFilterOptions) {
    return this.append({ type: 'colorAdjustment', ...options });
  }

  /** Append a raw 4×5 row-major color matrix (Skia format). */
  colorMatrix(options: number[] | ColorMatrixFilterOptions) {
    const matrix = Array.isArray(options) ? options : options.matrix;
    return this.append({ type: 'colorMatrix', matrix });
  }

  /** Append a curves filter from control `points` ([input, output] pairs). */
  curves(options: CurvesFilterOptions) {
    return this.append({ type: 'curves', points: options.points, channel: options.channel });
  }

  /** Append a posterize-time filter; snaps the video playhead to `fps` (video fills only). */
  posterizeTime(options: number | PosterizeTimeFilterOptions) {
    const { fps } = scalarFilter(options, "fps");
    return this.append({ type: 'posterizeTime', fps });
  }

  /** Append an echo (motion-trail) filter (video fills only). */
  echo(options: EchoFilterOptions) {
    return this.append({ type: 'echo', ...options });
  }

  /** Allows spreading the chain into an array: `[...ImageFilters.blur(5)]`. */
  *[Symbol.iterator]() {
    yield* this.list;
  }

  /** Serializes to the raw filter array so frameworks that call `toJSON` get a plain value. */
  toJSON() {
    return this.list;
  }
}

/**
 * Accepted shapes for an **image** fill's `filters` prop — a single pixel
 * filter, a plain array of them, or a `FilterChain`. Mirrors how `Fill` is the
 * loose author-facing union for a fill. Video-only filters are excluded here.
 */
export type ImageFilter = MediaFilter | MediaFilter[] | FilterChain;

/**
 * Accepted shapes for a **video** fill's `filters` prop — the pixel filters
 * plus the video-only temporal filters (`posterizeTime`, `echo`).
 */
export type VideoFilter =
  | (MediaFilter | VideoMediaFilter)
  | (MediaFilter | VideoMediaFilter)[]
  | FilterChain;

/**
 * Entry points for building **image** filter chains fluently.
 * Contains only pixel filters — video-only filters (`posterizeTime`, `echo`) are
 * excluded because image fills cannot use them.
 *
 * @example
 * node.filters = ImageFilters.blur(8).grayscale(1);
 */
export const ImageFilters = {
  blur: (options: number | BlurFilterOptions) => new FilterChain().blur(options),
  grayscale: (options: number | GrayscaleFilterOptions) => new FilterChain().grayscale(options),
  alpha: (options: number | AlphaFilterOptions) => new FilterChain().alpha(options),
  exposure: (options: number | ExposureFilterOptions) => new FilterChain().exposure(options),
  colorAdjustment: (options: ColorAdjustmentFilterOptions) => new FilterChain().colorAdjustment(options),
  colorMatrix: (options: number[] | ColorMatrixFilterOptions) => new FilterChain().colorMatrix(options),
  curves: (options: CurvesFilterOptions) => new FilterChain().curves(options),
};

/**
 * Entry points for building **video** filter chains fluently.
 * Contains all pixel filters plus the video-only temporal filters
 * (`posterizeTime`, `echo`).
 *
 * @example
 * node.filters = VideoFilters.posterizeTime(6);
 * node.filters = VideoFilters.grayscale(1).blur(6);
 */
export const VideoFilters = {
  ...ImageFilters,
  posterizeTime: (options: number | PosterizeTimeFilterOptions) => new FilterChain().posterizeTime(options),
  echo: (options: EchoFilterOptions) => new FilterChain().echo(options),
};

/**
 * Normalises any `ImageFilter`/`VideoFilter` value to a plain filter array.
 * Used internally when reading props before rendering or interpolation.
 */
export function resolveChainFilters(filters: ImageFilter | VideoFilter | undefined): AnyFilter[] {
  if (filters === undefined) return [];
  if (filters instanceof FilterChain) return filters.list;
  if (Array.isArray(filters)) return filters;
  return [filters];
}
