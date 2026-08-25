import { EasingFunction } from "./ease/type";

/**
 * Linearly interpolates between two numbers.
 *
 * @param from - Start value at `t = 0`.
 * @param to   - End value at `t = 1`.
 * @param t    - Normalized progress in [0, 1]. Values outside this range
 *               extrapolate beyond the endpoints.
 * @returns The interpolated value: `from + (to - from) * t`.
 */
export function lerpNumber(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/**
 * Interpolates a CSS-style perspective distance (viewer-to-plane, in px, where
 * `0` means "no perspective" — a parallel projection).
 *
 * Perspective enters the projection matrix as its reciprocal — a point at depth
 * `z` lands at `x / (1 - z/perspective)` — so `1/perspective` (not the raw
 * distance) is the quantity that varies smoothly with the visual strength of
 * the effect. Lerping the raw px value linearly sweeps through the small
 * positive numbers next to `0` on the way between "off" and any finite
 * distance, and `1/perspective` diverges there: a `0 → 800` tween would flash
 * through a wildly exaggerated, near-degenerate projection right at the start
 * before settling down to the mild depth `800` actually asks for. Lerping the
 * reciprocal instead — with `0` standing in for a reciprocal of `0`, matching
 * the renderer's own convention (see `isProjective`/`invP` in `matrix2d.ts`) —
 * keeps that quantity monotonic and bounded between the two endpoints, so the
 * effect builds or settles smoothly instead of spiking.
 */
export function lerpPerspective(from: number, to: number, t: number): number {
    const invFrom = from !== 0 ? 1 / from : 0;
    const invTo = to !== 0 ? 1 / to : 0;
    const inv = invFrom + (invTo - invFrom) * t;
    return inv !== 0 ? 1 / inv : 0;
}

export type LerpFunction<T> = (from: T, to: T, t: number) => T;
export type TweenOptions<T> = { ease?: EasingFunction, lerp?: LerpFunction<T>, delay?: number };