import { AudioFilterRegistry } from "../registry";
import { Param, lerpParam, equalsParam } from "../curve";

/** Attenuates frequencies above `frequency`, passing the lows through. */
export interface LowPassFilter {
    type: 'lowpass';
    /** Cutoff frequency in Hz. Content above this is rolled off. May be a time-varying curve. */
    frequency: Param;
    /** Resonance (Q) at the cutoff. Default 1. May be a time-varying curve. */
    q?: Param;
}

AudioFilterRegistry.register<LowPassFilter>("lowpass", {
    lerp: (from, to, t) => ({
        type: "lowpass",
        frequency: lerpParam(from.frequency, to.frequency, t),
        q: lerpParam(from.q ?? 1, to.q ?? 1, t),
    }),
    equals: (a, b) => equalsParam(a.frequency, b.frequency) && equalsParam(a.q ?? 1, b.q ?? 1),
});
