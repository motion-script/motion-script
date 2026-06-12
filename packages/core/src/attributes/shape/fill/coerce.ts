/**
 * Cross-type fill coercion for tweening.
 *
 * The renderer dispatches by `fill.type`, so an in-between frame of a tween must
 * be a fully-formed fill of a single concrete type. When the two endpoints of a
 * tween have different types (e.g. a solid `color` animating into a
 * `linear-gradient`, or one gradient kind into another) we first promote both
 * endpoints to a common target type, then run that type's normal `lerp`.
 *
 * The rules, in order:
 *
 *  - `color` is treated as a degenerate gradient — a single solid color. It is
 *    the least "rich" fill, so when one side is a color and the other a
 *    gradient, the gradient type wins and the color is expanded into a uniform
 *    gradient (every stop set to that color). A uniform gradient renders
 *    identically to the flat color, so frame 0 of a color→gradient tween looks
 *    exactly like the color, then morphs into the gradient.
 *
 *  - Two *different* gradient types share no geometry (a linear gradient's
 *    start/end has no radial-gradient counterpart). There is no meaningful
 *    in-between for that geometry, so we coerce toward the destination (`to`)
 *    type: colors/stops/opacity interpolate while the geometry adopts the
 *    destination's, snapped at frame 0.
 *
 * Coercion never mutates its input; it returns a fresh resolved fill.
 */

import type { NormalizedColor } from "./color/parser";
import type { FillResolved, FillCommon, FillSpace } from "./union";
import type { BlendMode } from "./blend";
import type { SolidFillResolved } from "./implementations/color";
import type { LinearGradientFillResolved } from "./implementations/linear-gradient";
import type { RadialGradientFillResolved } from "./implementations/radial-gradient";
import type { ConicGradientFillResolved } from "./implementations/conic-gradient";

/**
 * Resolved fills that carry a `colors` array (every gradient variant), with the
 * cross-cutting {@link FillCommon} fields (`space`) mixed in — mirroring how the
 * registry's `FillResolved` union wraps each implementation in `WithCommon`.
 */
type GradientResolved = FillCommon & (
    | LinearGradientFillResolved
    | RadialGradientFillResolved
    | ConicGradientFillResolved
);

/** Fill types that can participate in cross-type color/gradient tweening. */
const GRADIENT_TYPES = new Set<FillResolved["type"]>([
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
]);

/** True if `type` is a gradient (linear/radial/conic). */
export function isGradientType(type: FillResolved["type"]): boolean {
    return GRADIENT_TYPES.has(type);
}

/**
 * True if `a` and `b` can be tweened across their differing types — i.e. each is
 * either a solid color or a gradient, and at least one is a gradient. (Same-type
 * pairs are handled by the registry directly and never reach coercion.)
 */
export function canCoerce(a: FillResolved, b: FillResolved): boolean {
    const aColorish = a.type === "color" || isGradientType(a.type);
    const bColorish = b.type === "color" || isGradientType(b.type);
    if (!aColorish || !bColorish) return false;
    // At least one gradient — color↔color is same-type and never reaches here.
    return isGradientType(a.type) || isGradientType(b.type);
}

/** Builds a stop list of `count` evenly spaced positions in [0, 1]. */
function evenStops(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i / Math.max(1, count - 1));
}

/**
 * Expands a solid color into a gradient of `targetType` whose every stop is that
 * color, matching `stopCount` colors so the resulting gradient lerps cleanly
 * against the real gradient on the other side. The geometry defaults match each
 * gradient's `resolve()` so a uniform gradient renders as a flat color.
 */
function colorToGradient(
    color: NormalizedColor,
    opacity: number | undefined,
    blend: BlendMode | undefined,
    space: FillSpace | undefined,
    targetType: GradientResolved["type"],
    stopCount: number,
): GradientResolved {
    const n = Math.max(2, stopCount);
    const colors: NormalizedColor[] = Array.from({ length: n }, () => [...color] as NormalizedColor);
    const stops = evenStops(n);
    const common = { colors, stops, opacity, blend, space };

    switch (targetType) {
        case "linear-gradient":
            return { type: "linear-gradient", ...common, start: { x: -1, y: 1 }, end: { x: 1, y: -1 } };
        case "radial-gradient":
            return { type: "radial-gradient", ...common, center: { x: 0, y: 0 }, radius: 100 };
        case "conic-gradient":
            return { type: "conic-gradient", ...common, center: { x: 0, y: 0 }, startAngle: 0 };
    }
}

/**
 * Re-types a gradient as `targetType`, carrying its colors/stops/opacity and
 * adopting the target type's default geometry. Used when tweening between two
 * different gradient kinds, whose geometries are not interpolatable.
 */
function retypeGradient(
    g: GradientResolved,
    targetType: GradientResolved["type"],
): GradientResolved {
    if (g.type === targetType) return g;
    const common = { colors: g.colors, stops: g.stops, opacity: g.opacity, blend: g.blend, space: g.space };
    switch (targetType) {
        case "linear-gradient":
            return { type: "linear-gradient", ...common, start: { x: -1, y: 1 }, end: { x: 1, y: -1 } };
        case "radial-gradient":
            return { type: "radial-gradient", ...common, center: { x: 0, y: 0 }, radius: 100 };
        case "conic-gradient":
            return { type: "conic-gradient", ...common, center: { x: 0, y: 0 }, startAngle: 0 };
    }
}

/**
 * Promotes two differing-type fills (color and/or gradient) to a single common
 * type so the registry can lerp them with that type's `lerp`. Returns the
 * coerced `[a, b]` pair, both guaranteed to share `result[0].type`.
 *
 * Caller must have checked {@link canCoerce} first.
 */
export function coercePair(a: FillResolved, b: FillResolved): [FillResolved, FillResolved] {
    const aIsColor = a.type === "color";
    const bIsColor = b.type === "color";

    // color → gradient: expand the color to match the gradient's type.
    if (aIsColor && !bIsColor) {
        const grad = b as GradientResolved;
        const expanded = colorToGradient(
            (a as SolidFillResolved).color, a.opacity, a.blend, a.space, grad.type, grad.colors.length,
        );
        return [expanded, grad];
    }
    // gradient → color: expand the color (b) to match the gradient's (a) type.
    if (bIsColor && !aIsColor) {
        const grad = a as GradientResolved;
        const expanded = colorToGradient(
            (b as SolidFillResolved).color, b.opacity, b.blend, b.space, grad.type, grad.colors.length,
        );
        return [grad, expanded];
    }

    // Two different gradient types: coerce toward the destination (b) type.
    const ga = a as GradientResolved;
    const gb = b as GradientResolved;
    return [retypeGradient(ga, gb.type), gb];
}
