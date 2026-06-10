import { EaseFunction } from "./ease/type";

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

export type LerpFunction<T> = (from: T, to: T, t: number) => T;
export type TweenOptions<T> = { ease?: EaseFunction, lerp?: LerpFunction<T>, delay?: number };