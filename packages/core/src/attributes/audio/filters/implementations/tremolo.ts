import { AudioFilterRegistry } from "../registry";
import { Param, lerpParam, equalsParam } from "../curve";

/** Modulates the clip's amplitude with a low-frequency oscillator for a wobble effect. */
export interface TremoloFilter {
    type: 'tremolo';
    /** Modulation rate in Hz (how fast the volume pulses). May be a time-varying curve. */
    rate: Param;
    /** Modulation depth, 0–1. 0 = no effect, 1 = full dips to silence. May be a time-varying curve. */
    depth: Param;
}

AudioFilterRegistry.register<TremoloFilter>("tremolo", {
    lerp: (from, to, t) => ({
        type: "tremolo",
        rate: lerpParam(from.rate, to.rate, t),
        depth: lerpParam(from.depth, to.depth, t),
    }),
    equals: (a, b) => equalsParam(a.rate, b.rate) && equalsParam(a.depth, b.depth),
});
