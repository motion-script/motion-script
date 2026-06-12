import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Modulates the clip's amplitude with a low-frequency oscillator for a wobble effect. */
export interface TremoloFilter {
    type: 'tremolo';
    /** Modulation rate in Hz (how fast the volume pulses). */
    rate: number;
    /** Modulation depth, 0–1. 0 = no effect, 1 = full dips to silence. */
    depth: number;
}

AudioFilterRegistry.register<TremoloFilter>("tremolo", {
    lerp: (from, to, t) => ({
        type: "tremolo",
        rate: lerpNumber(from.rate, to.rate, t),
        depth: lerpNumber(from.depth, to.depth, t),
    }),
    equals: (a, b) => a.rate === b.rate && a.depth === b.depth,
});
