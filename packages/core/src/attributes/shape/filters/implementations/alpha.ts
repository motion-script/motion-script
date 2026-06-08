import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Multiplies every pixel's alpha channel by `value`, fading the entire layer. */
export interface AlphaFilter {
    type: 'alpha';
    /** 0 = fully transparent, 1 = unchanged. */
    value: number;
}

FilterRegistry.register<AlphaFilter>("alpha", {
    lerp: (from, to, t) => ({ type: "alpha", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
});
