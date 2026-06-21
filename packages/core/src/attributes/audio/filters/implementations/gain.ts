import { AudioFilterRegistry } from "../registry";
import { Param, lerpParam, equalsParam } from "../curve";

/** Scales the clip's amplitude by a linear factor. */
export interface GainFilter {
    type: 'gain';
    /** Linear gain multiplier. 1 = unchanged, 0 = silent, >1 = louder. May be a time-varying curve. */
    value: Param;
}

AudioFilterRegistry.register<GainFilter>("gain", {
    lerp: (from, to, t) => ({ type: "gain", value: lerpParam(from.value, to.value, t) }),
    equals: (a, b) => equalsParam(a.value, b.value),
});
