import { lerpNumber } from "@/tween/lerp";

/** Per-corner border radius values, all fully resolved to numbers. */
export interface BorderRadiusResolved {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
}

/**
 * Accepted border radius input: a single number applies uniformly to all corners;
 * a partial object overrides only the specified corners (unspecified corners fall
 * back to a previous value or 0 when resolved).
 */
export type BorderRadiusProps = number | Partial<BorderRadiusResolved>;

/** Returns true when `value` is a uniform (single-number) border radius. */
export function isUniformBorderRadius(value: BorderRadiusProps): value is number {
    return typeof value === "number";
}

/**
 * Returns the radius of a single corner from a resolved value.
 * Only valid when all corners are equal (i.e. the value originated from a uniform input).
 */
export function getUniformBorderRadius(value: BorderRadiusResolved): number {
    return value.topLeft;
}

/** Returns true when every corner of a resolved border radius is 0. */
export function isZeroBorderRadius(value: BorderRadiusResolved): boolean {
    return value.topLeft === 0 && value.topRight === 0 && value.bottomRight === 0 && value.bottomLeft === 0;
}

/** Interpolates each corner independently between two resolved radii. */
export function lerpBorderRadius(from: BorderRadiusResolved, to: BorderRadiusResolved, t: number): BorderRadiusResolved {
    return {
        topLeft: lerpNumber(from.topLeft, to.topLeft, t),
        topRight: lerpNumber(from.topRight, to.topRight, t),
        bottomLeft: lerpNumber(from.bottomLeft, to.bottomLeft, t),
        bottomRight: lerpNumber(from.bottomRight, to.bottomRight, t),
    };
}

/**
 * Resolves `BorderRadiusProps` into a fully-specified `BorderRadiusResolved`.
 *
 * - A number expands to all four corners set to that value.
 * - A partial object fills missing corners from `previous`, then falls back to 0.
 */
export function resolveBorderRadius(value: BorderRadiusProps, previous?: BorderRadiusResolved): BorderRadiusResolved {
    if (typeof value === "number") {
        return {
            topLeft: value,
            topRight: value,
            bottomLeft: value,
            bottomRight: value,
        };
    } else {
        return {
            topLeft: value.topLeft ?? previous?.topLeft ?? 0,
            topRight: value.topRight ?? previous?.topRight ?? 0,
            bottomLeft: value.bottomLeft ?? previous?.bottomLeft ?? 0,
            bottomRight: value.bottomRight ?? previous?.bottomRight ?? 0,
        };
    }
}