import { PaddingResolved } from "@/attributes/layout/padding";
import { SizeInput } from "@/attributes/layout/size";
import { lerpNumber } from "@/tween/lerp";

export function lerpSizeInput(from: SizeInput, to: SizeInput, t: number): SizeInput {
    if (typeof from === "number" && typeof to === "number") {
        return lerpNumber(from, to, t);
    }
    return t === 1 ? to : from;
}

export function lerpEdgeInset(from: PaddingResolved, to: PaddingResolved, t: number): PaddingResolved {
    return {
        left: lerpNumber(from.left, to.left, t),
        right: lerpNumber(from.right, to.right, t),
        top: lerpNumber(from.top, to.top, t),
        bottom: lerpNumber(from.bottom, to.bottom, t),
    };
}
