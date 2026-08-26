import type { AlphaFilter } from "./implementations/alpha";
import type { BlurFilter } from "./implementations/blur";
import type { ColorAdjustmentFilter } from "./implementations/color-adjustment";
import type { ColorMatrixFilter } from "./implementations/color-matrix";
import type { CurvesFilter } from "./implementations/curves";
import type { ExposureFilter } from "./implementations/exposure";
import type { GrayscaleFilter } from "./implementations/grayscale";
import type { PosterizeTimeFilter } from "./implementations/posterize-time";
import type { VideoEchoFilter } from "./implementations/echo";

import type { SceneEffect } from "../effects/union";
import type { BlurEffect } from "../effects/implementations/blur";
import type { GrayscaleEffect } from "../effects/implementations/grayscale";
import type { CurvesEffect } from "../effects/implementations/curves";
import type { ColorAdjustmentEffect } from "../effects/implementations/color-adjustment";
import type { MagnifyEffect } from "../effects/implementations/magnify";
import type { MotionBlurEffect } from "../effects/implementations/motion-blur";
import type { TrailsEffect } from "../effects/implementations/trails";
import type { OutlineEffect } from "../effects/implementations/outline";
import type { DropShadowEffect } from "@/attributes/shape/effects/implementations/drop-shadow";
import type { GlassEffect } from "../effects/implementations/glass";

/**
 * The scene effects that are **not** media filters, and why.
 *
 * Everything else in {@link SceneEffect} is a function of the pixels it is
 * given, so it means exactly the same thing applied to a node's rendered
 * content or to one fill layer's own pixels — and the renderer already runs
 * both through a single handler registry. This is the exception list, so a new
 * effect becomes a filter by default rather than by remembering to add it.
 *
 * Two reasons land here:
 *
 * - **Needs something a fill layer doesn't have.** `magnify` and `glass` sample
 *   the backdrop beneath the node — glass is a slab you see *through*, and a
 *   node's own paint is not something there is anything behind; `motionBlur` and
 *   `trails` are derived from the node's sampled velocity. A fill has no
 *   backdrop and no motion of its own.
 * - **Draws outside the silhouette.** `outline` paints a ring around the
 *   content, which the shape path a fill is clipped to would cut away.
 *
 * `blur`, `grayscale`, `curves` and `colorAdjustment` are excluded for a third,
 * bookkeeping reason: they already have a dedicated filter type below, sharing
 * the same fields and the same renderer handler.
 */
type NonFilterEffect =
    | MagnifyEffect
    | GlassEffect
    | MotionBlurEffect
    | TrailsEffect
    | OutlineEffect
    | DropShadowEffect
    | BlurEffect
    | GrayscaleEffect
    | CurvesEffect
    | ColorAdjustmentEffect;

/**
 * Scene effects usable as a media filter — i.e. applied to one image/video
 * fill's own pixels rather than to a node and everything under it.
 *
 * This is what lets a background image be oil-painted, dithered or posterized
 * without wrapping it in a node whose effect would also hit its children:
 *
 *     <Rect fill={Fills.image('bg.jpg', { filters: Adjustments.oilPaint(4) })}>
 *         <Text text="still sharp" />
 *     </Rect>
 *
 * The effects carry a `mode` field that means nothing here (a fill has no
 * backdrop); the {@link VideoAdjustmentChain} builders drop it, and the renderer ignores
 * it on this path.
 */
export type EffectAdjustment = Exclude<SceneEffect, NonFilterEffect>;

/**
 * Discriminated union of pixel filters — the filters valid on both image and
 * video fills. Each is realised either as a single CanvasKit image filter
 * applied via `paint.setImageFilter`, or — for the ones that resample pixel
 * *positions* — as a lens shader wrapping the fill's own shader.
 */
export type MediaAdjustment =
    | ExposureFilter
    | BlurFilter
    | GrayscaleFilter
    | AlphaFilter
    | ColorMatrixFilter
    | CurvesFilter
    | ColorAdjustmentFilter
    | EffectAdjustment;

/**
 * Discriminated union of video-only filters — temporal/multi-frame effects that
 * are meaningless on a still image (a single frame has no time axis and no
 * previous frames). Consumed outside the pixel `setImageFilter` path.
 */
export type VideoOnlyAdjustment =
    | PosterizeTimeFilter
    | VideoEchoFilter;
