/**
 * A flat animation driver. `advance(dt)` moves the animation forward by `dt`
 * seconds and returns `true` once it has completed (and applied its final
 * value). It must be primed at t=0 before the first `advance` so the starting
 * frame is correct — callers apply the initial value via `seek(0)`.
 *
 * `seek(elapsed)` is the absolute-time half, and is what a {@link Command}'s
 * `at` is built on: a stepper can be asked for any time, in any order, which is
 * what lets a timeline evaluate a frame without having played the ones before
 * it.
 */
/** @internal */
export interface TweenStepper {
    /**
     * Jump to the value corresponding to `elapsed` seconds from the start.
     * Call with `0` to prime the stepper before the first {@link advance}.
     */
    seek(elapsed: number): void;
    /**
     * Advance the animation by `dt` seconds.
     * @returns `true` when the animation has finished and its final value has
     *          been applied; `false` if it is still running.
     */
    advance(dt: number): boolean;
}

/**
 * Implemented by anything that can produce a {@link TweenStepper} — a
 * {@link Command}, and anything a host drives directly.
 */
export interface Steppable {
    /** Return a fresh stepper for a single playthrough of this animation. */
    _stepper(): TweenStepper;
}

export function isSteppable(x: unknown): x is Steppable {
    return typeof (x as Steppable)?._stepper === "function";
}
