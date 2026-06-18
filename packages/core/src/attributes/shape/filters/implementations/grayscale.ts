import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Desaturates the media layer toward black and white. */
export interface GrayscaleFilter {
    type: 'grayscale';
    /** 0 = original, 1 = fully grayscale. */
    value: number;
}

export const grayscaleFilter: FilterData<GrayscaleFilter> = {
    lerp: (from, to, t) => ({ type: "grayscale", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
};
