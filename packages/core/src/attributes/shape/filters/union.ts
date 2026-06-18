import type { AlphaFilter } from "./implementations/alpha";
import type { BlurFilter } from "./implementations/blur";
import type { ColorAdjustmentFilter } from "./implementations/color-adjustment";
import type { ColorMatrixFilter } from "./implementations/color-matrix";
import type { CurvesFilter } from "./implementations/curves";
import type { ExposureFilter } from "./implementations/exposure";
import type { GrayscaleFilter } from "./implementations/grayscale";
import type { PosterizeTimeFilter } from "./implementations/posterize-time";
import type { VideoEchoFilter } from "./implementations/echo";

/**
 * Discriminated union of pixel filters — the filters valid on both image and
 * video fills. Each composes into a single CanvasKit image filter applied via
 * `paint.setImageFilter`.
 */
export type MediaFilter =
    | ExposureFilter
    | BlurFilter
    | GrayscaleFilter
    | AlphaFilter
    | ColorMatrixFilter
    | CurvesFilter
    | ColorAdjustmentFilter;

/**
 * Discriminated union of video-only filters — temporal/multi-frame effects that
 * are meaningless on a still image (a single frame has no time axis and no
 * previous frames). Consumed outside the pixel `setImageFilter` path.
 */
export type VideoMediaFilter =
    | PosterizeTimeFilter
    | VideoEchoFilter;