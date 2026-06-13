import { lerpNumber } from "@/tween/lerp";
import { Corners, CornersInput, isUniformCorners, lerpCorners, resolveCorners } from "./per-corner";

/** Per-corner border radius values, all fully resolved to numbers. */
export type CornerRadiusResolved = Corners<number>;

/**
 * Accepted corner radius input: a single number applies uniformly to all corners;
 * an object overrides corners individually (`{ topLeft, … }`) or by axis
 * (`{ top, bottom }` / `{ left, right }`). Unspecified corners fall back to a
 * previous value or 0 when resolved.
 */
export type CornerRadiusProps = CornersInput<number>;

const isNumber = (v: CornerRadiusProps): v is number => typeof v === "number";

/** Returns true when `value` is a uniform (single-number) corner radius input. */
export function isUniformCornerRadiusInput(value: CornerRadiusProps): value is number {
    return typeof value === "number";
}

/** Returns true when every corner of a resolved corner radius is equal. */
export function isUniformCornerRadius(value: CornerRadiusResolved): boolean {
    return isUniformCorners(value);
}

/**
 * Returns the radius of a single corner from a resolved value.
 * Only valid when all corners are equal (i.e. the value originated from a uniform input).
 */
export function getUniformCornerRadius(value: CornerRadiusResolved): number {
    return value.topLeft;
}

/** Returns true when every corner of a resolved corner radius is 0. */
export function isZeroCornerRadius(value: CornerRadiusResolved): boolean {
    return value.topLeft === 0 && value.topRight === 0 && value.bottomRight === 0 && value.bottomLeft === 0;
}

/** Interpolates each corner independently between two resolved radii. */
export function lerpCornerRadius(from: CornerRadiusResolved, to: CornerRadiusResolved, t: number): CornerRadiusResolved {
    return lerpCorners(from, to, t, lerpNumber);
}

/**
 * Resolves `CornerRadiusProps` into a fully-specified `CornerRadiusResolved`.
 *
 * - A number expands to all four corners set to that value.
 * - An object fills missing corners from `previous`, then falls back to 0.
 */
export function resolveCornerRadius(value: CornerRadiusProps, previous?: CornerRadiusResolved): CornerRadiusResolved {
    return resolveCorners(value, 0, previous, isNumber);
}
