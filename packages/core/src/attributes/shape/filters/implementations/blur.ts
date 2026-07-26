import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Applies a Gaussian blur to the media layer. */
export interface BlurFilter {
    type: 'blur';
    /** Blur radius in pixels. */
    radius: number;
}

export const blurFilter: FilterData<BlurFilter> = {
    lerp: (from, to, t) => ({ type: "blur", radius: lerpNumber(from.radius, to.radius, t) }),
    equals: (a, b) => a.radius === b.radius,
};
