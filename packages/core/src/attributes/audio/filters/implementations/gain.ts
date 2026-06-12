import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Scales the clip's amplitude by a linear factor. */
export interface GainFilter {
    type: 'gain';
    /** Linear gain multiplier. 1 = unchanged, 0 = silent, >1 = louder. */
    value: number;
}

AudioFilterRegistry.register<GainFilter>("gain", {
    lerp: (from, to, t) => ({ type: "gain", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
});
