import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Applies a Gaussian blur to the media layer. */
export interface BlurFilter {
    type: 'blur';
    /** Blur radius in pixels. */
    value: number;
}

export const blurFilter: FilterData<BlurFilter> = {
    lerp: (from, to, t) => ({ type: "blur", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
};
