import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { lerpFillArray } from "../fill/registry";

// Helper function to interpolate numeric arrays
function lerpDashArray(from: number[] | undefined, to: number[] | undefined, t: number): number[] | undefined {
    const fArray = from || [];
    const tArray = to || [];

    // If both are undefined/empty, return the original reference
    if (fArray.length === 0 && tArray.length === 0) return from;

    const len = Math.max(fArray.length, tArray.length);
    const result: number[] = new Array(len);

    for (let i = 0; i < len; i++) {
        // Pad shorter arrays with 0 to ensure smooth transitions
        const fVal = fArray[i] ?? 0;
        const tVal = tArray[i] ?? 0;
        result[i] = fVal + (tVal - fVal) * t;
    }

    return result;
}

function lerpStroke(from: StrokeResolved, to: StrokeResolved, t: number): StrokeResolved {
    return {
        weight: (from.weight) + ((to.weight) - (from.weight)) * t,
        fill: lerpFillArray(from.fill, to.fill, t),
        dash: lerpDashArray(from.dash, to.dash, t) as number[], // Cast based on your StrokeResolved type expectations
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