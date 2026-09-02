import { TweenStepper } from "./stepper";
import type { Command } from "./command";

/**
 * An animation that occupies its duration and writes nothing.
 *
 * What a command on an **unmounted** node becomes. A node that is not in the
 * tree has no box, no surface and no timeline, so a tween on it has nothing to
 * be a tween *of* — but it still has a duration, and the timeline slot it was
 * placed in is entitled to have that duration pass. Returning a real command of
 * the right length keeps the scene's timing intact where throwing would abort
 * the pass and where returning nothing would silently shorten it.
 *
 * The failure this turns into a no-op is a real one — animating a node the
 * author forgot to `add` — and it reads as "nothing moved", which is what the
 * author sees on screen anyway.
 */
export function inertCommand<P>(target: object, duration: number): Command<P> {
    void target;
    return {
        duration,
        at: () => ({}) as Partial<P>,
        _stepper: () => inertStepper(duration),
    };
}

/** The {@link TweenStepper} half of {@link inertCommand}: runs its clock, writes nothing. */
export function inertStepper(duration: number): TweenStepper {
    let elapsed = 0;
    return {
        seek: (e: number) => { elapsed = e; },
        advance: (dt: number): boolean => {
            elapsed += dt;
            return elapsed >= duration;
        },
    };
}
