/**
 * Clamps a number between a minimum and maximum value.
 *
 * @param value - The number to clamp.
 * @param min - The lower bound.
 * @param max - The upper bound.
 * @returns The clamped number.
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

/** Shorthand for `clamp(t, 0, 1)`, commonly used to normalize tween progress. */
export function clamp01(t: number) {
    return clamp(t, 0, 1);
}
