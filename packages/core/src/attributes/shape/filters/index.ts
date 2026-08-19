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

/** @internal Chainable filter builder API, chain classes, and the loose author-facing unions. */
/** @internal */ export { Adjustments, VideoAdjustments, AdjustmentChain, VideoAdjustmentChain, resolveChainAdjustments } from './chain';
/** @internal @deprecated Renamed to `Adjustments`/`VideoAdjustments`. */
/** @internal */ export { ImageFilters, VideoFilters } from './chain';
/** @internal */ export type { ImageAdjustment, VideoAdjustment } from './chain';

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

/**
 * @internal Unions of concrete filter types: pixel (`MediaAdjustment`), video-only,
 * and the scene effects that double as filters.
 */
/** @internal */ export type { MediaAdjustment, VideoOnlyAdjustment, EffectAdjustment } from './union';

/** @internal Interpolation/equality registry: constants map plus the lerp helpers. */
/** @internal */ export { lerpFilter, lerpFilterArray, isPixelFilter, hasFilter, prepareFilter, filterSurface } from './registry';
/** @internal */ export type { FilterData, AnyFilter } from './registry';
