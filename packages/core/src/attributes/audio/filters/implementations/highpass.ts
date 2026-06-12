import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Attenuates frequencies below `frequency`, passing the highs through. */
export interface HighPassFilter {
    type: 'highpass';
    /** Cutoff frequency in Hz. Content below this is rolled off. */
    frequency: number;
    /** Resonance (Q) at the cutoff. Default 1. */
    q?: number;
}

AudioFilterRegistry.register<HighPassFilter>("highpass", {
    lerp: (from, to, t) => ({
        type: "highpass",
        frequency: lerpNumber(from.frequency, to.frequency, t),
        q: lerpNumber(from.q ?? 1, to.q ?? 1, t),
    }),
    equals: (a, b) => a.frequency === b.frequency && (a.q ?? 1) === (b.q ?? 1),
});
