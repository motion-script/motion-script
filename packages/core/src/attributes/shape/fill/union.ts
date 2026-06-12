/**
 * Union types that represent every supported fill variant.
 *
 * Two flavors exist for each fill:
 *  - **Prop** — the loose author-facing shape accepted by node props (e.g. CSS
 *    color strings, optional fields with sensible defaults).
 *  - **Resolved** — the strict internal shape used by the renderer after
 *    {@link FillRegistry.resolve} has normalised every field.
 */

/**
 * Reference frame a fill (and the stroke/shadow that wrap one) resolves
 * against. The drawn shapes are always treated as one unit (their union); the
 * space only changes which rect the gradient/image is mapped onto:
 *
 *  - `local`  — the shape's own (union) bounds. The fill is pinned to the
 *               figure, so moving the node around does not change its
 *               appearance. This is the default.
 *  - `parent` — the parent node's layout rect; moving the node *within* its
 *               parent slides it across the fill, so the appearance changes.
 *  - `global` — the render viewport; the fill is anchored to the frame, so
 *               moving the node anywhere on screen changes which slice it shows.
 */
export type FillSpace = "local" | "parent" | "global";

import { SolidFillProp, SolidFillResolved } from "./implementations/color";
import { ConicGradientFillProp, ConicGradientFillResolved } from "./implementations/conic-gradient";
import { ImageFillProp, ImageFillResolved } from "./implementations/image";
import { LinearGradientFillProp, LinearGradientFillResolved } from "./implementations/linear-gradient";
import { NoiseFillProp, NoiseFillResolved } from "./implementations/noise";
import { RadialGradientFillProp, RadialGradientFillResolved } from "./implementations/radial-gradient";
import { StripeFillProp, StripeFillResolved } from "./implementations/stripe";

/**
 * Loose fill value accepted by node `fill` props.
 *
 * A plain CSS color string (e.g. `"red"`, `"#ff0"`) is shorthand for a
 * {@link SolidFillProp} and is resolved automatically by the registry.
 */
/** Fields shared by every fill variant, regardless of type. */
export interface FillCommon {
    /**
     * Reference frame this fill resolves against. Defaults to `local`.
     * See {@link FillSpace}.
     */
    space?: FillSpace;
}

type WithCommon<T> = T & FillCommon;

export type FillProp =
    | string
    | WithCommon<SolidFillProp>
    | WithCommon<NoiseFillProp>
    | WithCommon<StripeFillProp>
    | WithCommon<LinearGradientFillProp>
    | WithCommon<RadialGradientFillProp>
    | WithCommon<ConicGradientFillProp>
    | WithCommon<ImageFillProp>;

/** Fully resolved fill ready for the renderer. */
export type FillResolved =
    | WithCommon<SolidFillResolved>
    | WithCommon<NoiseFillResolved>
    | WithCommon<StripeFillResolved>
    | WithCommon<LinearGradientFillResolved>
    | WithCommon<RadialGradientFillResolved>
    | WithCommon<ConicGradientFillResolved>
    | WithCommon<ImageFillResolved>;
