import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Applies a Gaussian blur to the media layer. */
export interface BlurFilter {
    type: 'blur';
    /** Blur radius in pixels. */
    value: number;
}

FilterRegistry.register<BlurFilter>("blur", {
    lerp: (from, to, t) => ({ type: "blur", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
});
