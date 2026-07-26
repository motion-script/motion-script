import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Desaturates the media layer toward black and white. */
export interface GrayscaleFilter {
    type: 'grayscale';
    /** 0 = original, 1 = fully grayscale. */
    amount: number;
}

export const grayscaleFilter: FilterData<GrayscaleFilter> = {
    lerp: (from, to, t) => ({ type: "grayscale", amount: lerpNumber(from.amount, to.amount, t) }),
    equals: (a, b) => a.amount === b.amount,
};
