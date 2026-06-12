import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Adds a delayed, fading repeat of the signal (a feedback echo / simple delay). */
export interface EchoFilter {
    type: 'echo';
    /** Delay before the first repeat, in seconds. */
    delay: number;
    /** Feedback amount, 0–<1. Each repeat is scaled by this; higher = more repeats. */
    feedback: number;
    /** Wet/dry mix, 0–1. 0 = dry only, 1 = full wet. Default 0.5. */
    mix?: number;
}

AudioFilterRegistry.register<EchoFilter>("echo", {
    lerp: (from, to, t) => ({
        type: "echo",
        delay: lerpNumber(from.delay, to.delay, t),
        feedback: lerpNumber(from.feedback, to.feedback, t),
        mix: lerpNumber(from.mix ?? 0.5, to.mix ?? 0.5, t),
    }),
    equals: (a, b) =>
        a.delay === b.delay && a.feedback === b.feedback && (a.mix ?? 0.5) === (b.mix ?? 0.5),
});
