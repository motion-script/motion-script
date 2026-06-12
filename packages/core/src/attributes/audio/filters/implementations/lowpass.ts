import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Attenuates frequencies above `frequency`, passing the lows through. */
export interface LowPassFilter {
    type: 'lowpass';
    /** Cutoff frequency in Hz. Content above this is rolled off. */
    frequency: number;
    /** Resonance (Q) at the cutoff. Default 1. */
    q?: number;
}

AudioFilterRegistry.register<LowPassFilter>("lowpass", {
    lerp: (from, to, t) => ({
        type: "lowpass",
        frequency: lerpNumber(from.frequency, to.frequency, t),
        q: lerpNumber(from.q ?? 1, to.q ?? 1, t),
    }),
    equals: (a, b) => a.frequency === b.frequency && (a.q ?? 1) === (b.q ?? 1),
});
