import { AudioFilterRegistry } from "../registry";
import { Param, lerpParam, equalsParam } from "../curve";

/** Adds a delayed, fading repeat of the signal (a feedback echo / simple delay). */
export interface EchoFilter {
    type: 'echo';
    /** Delay before the first repeat, in seconds. May be a time-varying curve. */
    delay: Param;
    /** Feedback amount, 0–<1. Each repeat is scaled by this; higher = more repeats. May be a time-varying curve. */
    feedback: Param;
    /** Wet/dry mix, 0–1. 0 = dry only, 1 = full wet. Default 0.5. May be a time-varying curve. */
    mix?: Param;
}

AudioFilterRegistry.register<EchoFilter>("echo", {
    lerp: (from, to, t) => ({
        type: "echo",
        delay: lerpParam(from.delay, to.delay, t),
        feedback: lerpParam(from.feedback, to.feedback, t),
        mix: lerpParam(from.mix ?? 0.5, to.mix ?? 0.5, t),
    }),
    equals: (a, b) =>
        equalsParam(a.delay, b.delay) && equalsParam(a.feedback, b.feedback) && equalsParam(a.mix ?? 0.5, b.mix ?? 0.5),
});
