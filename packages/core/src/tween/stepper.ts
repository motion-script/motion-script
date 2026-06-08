/**
 * A non-generator animation driver. `advance(dt)` moves the animation forward
 * by `dt` seconds and returns `true` once it has completed (and applied its
 * final value). It must be primed at t=0 before the first `advance` so the
 * starting frame is correct — callers apply the initial value via `seek(0)`.
 *
 * This is the flat alternative to a {@link FrameGenerator}: {@link parallel}
 * can drive a batch of steppers in one tight loop with zero generator resumes
 * per item, which matters when hundreds of node tweens run simultaneously.
 */
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
 * Implemented by objects that can produce a {@link TweenStepper} instead of
 * (or in addition to) a {@link FrameGenerator}. {@link parallel} checks for
 * this interface and prefers the stepper path when available.
 */
export interface Steppable {
    /** Return a fresh stepper for a single playthrough of this animation. */
    _stepper(): TweenStepper;
}

export function isSteppable(x: unknown): x is Steppable {
    return typeof (x as Steppable)?._stepper === "function";
}
