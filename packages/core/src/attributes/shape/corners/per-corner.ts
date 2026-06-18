import { LerpFunction } from "@/tween/lerp";

/** A value supplied independently for each of the four corners. */
export interface Corners<T> {
    topLeft: T;
    topRight: T;
    bottomLeft: T;
    bottomRight: T;
}

/**
 * The accepted input grammar for any per-corner property (radius, style,
 * smoothing), generic over the corner value type `T`:
 *
 * - a single `T` applies uniformly to all four corners;
 * - `{ topLeft, … }` overrides individual corners (unspecified corners fall back
 *   to a previous value or the type's default when resolved);
 * - `{ top, bottom }` sets the top pair (`topLeft`, `topRight`) and/or the bottom
 *   pair (`bottomLeft`, `bottomRight`);
 * - `{ left, right }` sets the left pair (`topLeft`, `bottomLeft`) and/or the
 *   right pair (`topRight`, `bottomRight`).
 */
export type CornersInput<T> =
    | T
    | Partial<Corners<T>>
    | { top?: T; bottom?: T }
    | { left?: T; right?: T };

/** Narrows a {@link CornersInput} to its scalar form. */
export type CornerScalarGuard<T> = (value: CornersInput<T>) => value is T;

function makeUniform<T>(value: T): Corners<T> {
    return { topLeft: value, topRight: value, bottomLeft: value, bottomRight: value };
}

// The {top,bottom} / {left,right} axis shorthands map to corners as documented
// on CornersInput. Centralised here so the mapping is a single, test-pinned
// chokepoint rather than scattered across the resolver.
function fromTopBottom<T>(v: { top?: T; bottom?: T }, fb: Corners<T>): Corners<T> {
    return {
        topLeft: v.top ?? fb.topLeft,
        topRight: v.top ?? fb.topRight,
        bottomLeft: v.bottom ?? fb.bottomLeft,
        bottomRight: v.bottom ?? fb.bottomRight,
    };
}

function fromLeftRight<T>(v: { left?: T; right?: T }, fb: Corners<T>): Corners<T> {
    return {
        topLeft: v.left ?? fb.topLeft,
        topRight: v.right ?? fb.topRight,
        bottomLeft: v.left ?? fb.bottomLeft,
        bottomRight: v.right ?? fb.bottomRight,
    };
}

/**
 * Resolves a {@link CornersInput} into a fully-specified {@link Corners}.
 *
 * Precedence per corner mirrors the rest of the codebase's mappers:
 * supplied value → `previous` → `fallback`. `isScalar` discriminates the scalar
 * form from the object forms (e.g. `typeof v === "number"` for radius/smooth,
 * or a string-literal check for style).
 */
export function resolveCorners<T>(
    value: CornersInput<T>,
    fallback: T,
    previous: Corners<T> | undefined,
    isScalar: CornerScalarGuard<T>,
): Corners<T> {
    if (isScalar(value)) {
        return makeUniform(value);
    }

    const fb: Corners<T> = previous ?? makeUniform(fallback);
    const obj = value as Record<string, T | undefined>;

    // Per-corner keys take precedence over the axis shorthands when mixed, so
    // the more specific form wins.
    if ("topLeft" in obj || "topRight" in obj || "bottomLeft" in obj || "bottomRight" in obj) {
        const v = value as Partial<Corners<T>>;
        return {
            topLeft: v.topLeft ?? fb.topLeft,
            topRight: v.topRight ?? fb.topRight,
            bottomLeft: v.bottomLeft ?? fb.bottomLeft,
            bottomRight: v.bottomRight ?? fb.bottomRight,
        };
    }
    if ("top" in obj || "bottom" in obj) {
        return fromTopBottom(value as { top?: T; bottom?: T }, fb);
    }
    if ("left" in obj || "right" in obj) {
        return fromLeftRight(value as { left?: T; right?: T }, fb);
    }
    // Empty object: keep the fallback for every corner.
    return { ...fb };
}

/** Interpolates each corner independently with the supplied per-value lerp. */
export function lerpCorners<T>(
    from: Corners<T>,
    to: Corners<T>,
    t: number,
    lerp: LerpFunction<T>,
): Corners<T> {
    return {
        topLeft: lerp(from.topLeft, to.topLeft, t),
        topRight: lerp(from.topRight, to.topRight, t),
        bottomLeft: lerp(from.bottomLeft, to.bottomLeft, t),
        bottomRight: lerp(from.bottomRight, to.bottomRight, t),
    };
}

/** Returns true when all four corners are equal (under `eq`, default `Object.is`). */
export function isUniformCorners<T>(c: Corners<T>, eq: (a: T, b: T) => boolean = Object.is): boolean {
    return eq(c.topLeft, c.topRight) && eq(c.topLeft, c.bottomLeft) && eq(c.topLeft, c.bottomRight);
}
