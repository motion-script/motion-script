import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Multiplies every pixel's alpha channel by `amount`, fading the entire layer. */
export interface AlphaFilter {
    type: 'alpha';
    /** 0 = fully transparent, 1 = unchanged. */
    amount: number;
}

export const alphaFilter: FilterData<AlphaFilter> = {
    lerp: (from, to, t) => ({ type: "alpha", amount: lerpNumber(from.amount, to.amount, t) }),
    equals: (a, b) => a.amount === b.amount,
};
