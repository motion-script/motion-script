import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Scales the overall luminance of the media layer. */
export interface ExposureFilter {
    type: 'exposure';
    /** Exposure multiplier. 1 = unchanged, >1 brighter, <1 darker. */
    value: number;
}

FilterRegistry.register<ExposureFilter>("exposure", {
    lerp: (from, to, t) => ({ type: "exposure", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
});
