import { MediaFilter } from "./union";
import type { CurvesChannel } from "./implementations/curves";

/**
 * Immutable, chainable list of media filters.
 *
 * Each builder method returns a new `FilterChain` with the filter appended,
 * so chains are safe to share and branch.
 *
 * @example
 * const mx = MX.blur(4).grayscale(0.5);
 * node.filters = mx; // assign directly
 * node.filters = [...mx, { type: 'alpha', value: 0.5 }]; // spread into array
 */
export class FilterChain {
  constructor(public list: MediaFilter[] = []) { }

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

  /** Allows spreading the chain into an array: `[...MX.blur(5)]`. */
  *[Symbol.iterator]() {
    yield* this.list;
  }

  /** Serializes to the raw filter array so frameworks that call `toJSON` get a plain value. */
  toJSON() {
    return this.list;
  }
}

/**
 * Accepted shapes for a node's `filters` prop.
 * Can be a single filter, a plain array, or a `FilterChain` builder result.
 */
export type ChainableMx = MediaFilter[] | FilterChain | MediaFilter;

const createChain = (list: MediaFilter[] = []): FilterChain => new FilterChain(list);

/**
 * Entry points for building media-filter chains fluently.
 *
 * @example
 * node.filters = MX.blur(8).grayscale(1);
 */
export const MX = {
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
 * Normalises any `ChainableMx` value to a plain `MediaFilter[]`.
 * Used internally when reading props before rendering or interpolation.
 */
export function resolveChainFilters(filters: ChainableMx | undefined): MediaFilter[] {
  if (filters === undefined) return [];
  if (filters instanceof FilterChain) return filters.list;
  if (Array.isArray(filters)) return filters;
  return [filters];
}
