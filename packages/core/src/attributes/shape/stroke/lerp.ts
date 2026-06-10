import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { lerpFillArray } from "../fill/registry";

function lerpStroke(from: StrokeResolved, to: StrokeResolved, t: number): StrokeResolved {
    return {
        weight: (from.weight) + ((to.weight) - (from.weight)) * t,
        fill: lerpFillArray(from.fill, to.fill, t),
        dash: t < 0.5 ? from.dash : to.dash,
        dashOffset: (from.dashOffset) + ((to.dashOffset) - (from.dashOffset)) * t,
        align: (from.align) + ((to.align) - (from.align)) * t,
    };
}

export function lerpStrokeArray(from: StrokeResolved[], to: StrokeResolved[], t: number): StrokeResolved[] {
    if (from === to) return from;
    const len = Math.max(from.length, to.length);
    const result: StrokeResolved[] = [];
    for (let i = 0; i < len; i++) {
        const f = from[i];
        const tf = to[i];
        if (!f) { result.push(tf); continue; }
        if (!tf) { result.push(f); continue; }
        result.push(lerpStroke(f, tf, t));
    }
    return result;
}
