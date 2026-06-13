import { CornerStyle } from "./corner-style";

/**
 * Scalar (single-value) corner helpers for shapes whose vertices don't map to
 * named corners — polygons and polygrams apply one style/smoothing to every
 * vertex, so they use these instead of the per-corner {@link CornersInput} forms.
 */

/** Snap-at-midpoint tween for a scalar corner style (discrete enum). */
export function lerpCornerScalarStyle(from: CornerStyle, to: CornerStyle, t: number): CornerStyle {
    return t < 0.5 ? from : to;
}
