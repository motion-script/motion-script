import { PaddingResolved } from "@/attributes/layout/padding";

/**
 * Compute the inner content area produced by subtracting an EdgeInset
 * from an outer size. Pure — works for any width/height pair.
 */
export interface InnerArea {
    width: number;
    height: number;
    /** Offset of inner-area center relative to outer-area center. */
    offsetX: number;
    offsetY: number;
}

export function applyPadding(outerWidth: number, outerHeight: number, pad: PaddingResolved): InnerArea {
    return {
        width: Math.max(0, outerWidth - pad.left - pad.right),
        height: Math.max(0, outerHeight - pad.top - pad.bottom),
        offsetX: (pad.left - pad.right) / 2,
        offsetY: (pad.top - pad.bottom) / 2,
    };
}

/** Add padding back onto an inner size to get the outer size that contains it. */
export function expandByPadding(innerWidth: number, innerHeight: number, pad: PaddingResolved): { width: number; height: number } {
    return {
        width: innerWidth + pad.left + pad.right,
        height: innerHeight + pad.top + pad.bottom,
    };
}
