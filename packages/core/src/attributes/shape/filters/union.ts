import type { AlphaFilter } from "./implementations/alpha";
import type { BlurFilter } from "./implementations/blur";
import type { ColorAdjustmentFilter } from "./implementations/color-adjustment";
import type { ColorMatrixFilter } from "./implementations/color-matrix";
import type { CurvesFilter } from "./implementations/curves";
import type { ExposureFilter } from "./implementations/exposure";
import type { GrayscaleFilter } from "./implementations/grayscale";

/** Discriminated union of every media-filter type a media node can carry. */
export type MediaFilter =
    | ExposureFilter
    | BlurFilter
    | GrayscaleFilter
    | AlphaFilter
    | ColorMatrixFilter
    | CurvesFilter
    | ColorAdjustmentFilter;