import { MediaFilter, VideoMediaFilter } from "./union";
import type { CurvesChannel } from "./implementations/curves";
import type { VideoEchoFilter } from "./implementations/echo";

/** Any concrete filter a chain may hold — pixel or video-only. */
type AnyFilter = MediaFilter | VideoMediaFilter;

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
 * node.filters = [...chain, { type: 'alpha', value: 0.5 }]; // spread into array
 */
export class FilterChain {
  constructor(public list: AnyFilter[] = []) { }

  /** Append a blur with the given pixel `radius`. */
  blur(radius: number) {
    return new FilterChain([...this.list, { type: 'blur', value: radius }]);
  }

  /** Append a grayscale filter with `amount` in the 0–1 range. */
  grayscale(amount: number) {
    return new FilterChain([...this.list, { type: 'grayscale', value: amount }]);
  }

  /** Append an alpha (opacity) filter; `value` 0 = transparent, 1 = unchanged. */
  alpha(value: number) {
    return new FilterChain([...this.list, { type: 'alpha', value }]);
  }

  /** Append an exposure filter; `value` 1 = unchanged, >1 brighter, <1 darker. */
  exposure(value: number) {
    return new FilterChain([...this.list, { type: 'exposure', value }]);
  }

  /** Append a color-adjustment filter from the given partial settings. */
  colorAdjustment(settings: Omit<Extract<MediaFilter, { type: 'colorAdjustment' }>, 'type'>) {
    return new FilterChain([...this.list, { type: 'colorAdjustment', ...settings }]);
  }

  /** Append a raw 4×5 row-major color matrix (Skia format). */
  colorMatrix(matrix: number[]) {
    return new FilterChain([...this.list, { type: 'colorMatrix', matrix }]);
  }

  /** Append a curves filter from control `points` ([input, output] pairs) on an optional `channel`. */
  curves(points: [number, number][], channel?: CurvesChannel) {
    return new FilterChain([...this.list, { type: 'curves', points, channel }]);
  }

  /** Append a posterize-time filter; snaps the video playhead to `fps` (video fills only). */
  posterizeTime(fps: number) {
    return new FilterChain([...this.list, { type: 'posterizeTime', fps }]);
  }

  /** Append an echo (motion-trail) filter from the given settings (video fills only). */
  echo(settings: Omit<VideoEchoFilter, 'type'>) {
    return new FilterChain([...this.list, { type: 'echo', ...settings }]);
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

const createChain = (list: AnyFilter[] = []): FilterChain => new FilterChain(list);

/** Shared pixel-filter builders used by both `ImageFilters` and `VideoFilters`. */
const pixelBuilders = {
  blur: (radius: number) => createChain([{ type: 'blur', value: radius }]),
  grayscale: (amount: number) => createChain([{ type: 'grayscale', value: amount }]),
  alpha: (value: number) => createChain([{ type: 'alpha', value }]),
  exposure: (value: number) => createChain([{ type: 'exposure', value }]),
  colorAdjustment: (settings: Omit<Extract<MediaFilter, { type: 'colorAdjustment' }>, 'type'>) =>
    createChain([{ type: 'colorAdjustment', ...settings }]),
  colorMatrix: (matrix: number[]) => createChain([{ type: 'colorMatrix', matrix }]),
  curves: (points: [number, number][], channel?: CurvesChannel) =>
    createChain([{ type: 'curves', points, channel }]),
};

/**
 * Entry points for building **image** filter chains fluently.
 * Contains only pixel filters — video-only filters (`posterizeTime`, `echo`) are
 * excluded because image fills cannot use them.
 *
 * @example
 * node.filters = ImageFilters.blur(8).grayscale(1);
 */
export const ImageFilters = { ...pixelBuilders };

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
  ...pixelBuilders,
  posterizeTime: (fps: number) => createChain([{ type: 'posterizeTime', fps }]),
  echo: (settings: Omit<VideoEchoFilter, 'type'>) => createChain([{ type: 'echo', ...settings }]),
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
