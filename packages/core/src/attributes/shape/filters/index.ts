/** @internal Media-filter data types for each built-in filter. */
/** @internal */ export type { ExposureFilter } from './implementations/exposure';
/** @internal */ export type { BlurFilter } from './implementations/blur';
/** @internal */ export type { GrayscaleFilter } from './implementations/grayscale';
/** @internal */ export type { AlphaFilter } from './implementations/alpha';
/** @internal */ export type { ColorMatrixFilter } from './implementations/color-matrix';
/** @internal */ export type { CurvesChannel, CurvesFilter } from './implementations/curves';
/** @internal */ export type { ColorAdjustmentFilter } from './implementations/color-adjustment';
/** @internal */ export type { PosterizeTimeFilter } from './implementations/posterize-time';
/** @internal */ export type { VideoEchoFilter } from './implementations/echo';

/** @internal Chainable filter builder API, chain class, and the loose author-facing unions. */
/** @internal */ export { ImageFilters, VideoFilters, FilterChain, resolveChainFilters } from './chain';
/** @internal */ export type { ImageFilter, VideoFilter } from './chain';

/** @internal Per-builder options. Each builder takes one of these, or its dominant scalar. */
/** @internal */ export type {
    BlurFilterOptions,
    GrayscaleFilterOptions,
    AlphaFilterOptions,
    ExposureFilterOptions,
    ColorMatrixFilterOptions,
    CurvesFilterOptions,
    ColorAdjustmentFilterOptions,
    PosterizeTimeFilterOptions,
    EchoFilterOptions as VideoEchoFilterOptions,
} from './chain';

/** @internal Unions of concrete filter types: pixel (`MediaFilter`) and video-only. */
/** @internal */ export type { MediaFilter, VideoMediaFilter } from './union';

/** @internal Interpolation/equality registry: constants map plus the lerp helpers. */
/** @internal */ export { lerpFilter, lerpFilterArray, isPixelFilter, hasFilter } from './registry';
/** @internal */ export type { FilterData, AnyFilter } from './registry';
