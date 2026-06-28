/** Media-filter data types for each built-in filter. */
export type { ExposureFilter } from './implementations/exposure';
export type { BlurFilter } from './implementations/blur';
export type { GrayscaleFilter } from './implementations/grayscale';
export type { AlphaFilter } from './implementations/alpha';
export type { ColorMatrixFilter } from './implementations/color-matrix';
export type { CurvesChannel, CurvesFilter } from './implementations/curves';
export type { ColorAdjustmentFilter } from './implementations/color-adjustment';
export type { PosterizeTimeFilter } from './implementations/posterize-time';
export type { VideoEchoFilter } from './implementations/echo';

/** Chainable filter builder API, chain class, and the loose author-facing unions. */
export { ImageFilters, VideoFilters, FilterChain, resolveChainFilters } from './chain';
export type { ImageFilter, VideoFilter } from './chain';

/** Unions of concrete filter types: pixel (`MediaFilter`) and video-only. */
export type { MediaFilter, VideoMediaFilter } from './union';

/** Interpolation/equality registry: constants map plus the lerp helpers. */
export { lerpFilter, lerpFilterArray, isPixelFilter, hasFilter } from './registry';
export type { FilterData, AnyFilter } from './registry';
