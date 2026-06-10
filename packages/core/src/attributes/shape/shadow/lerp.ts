import { lerpFillArray } from "../fill/registry";
import { ShadowResolved } from "./resolver";

function lerpShadow(from: ShadowResolved, to: ShadowResolved, t: number): ShadowResolved {
    return {
        blur: from.blur + (to.blur - from.blur) * t,
        dx: (from.dx ?? 0) + ((to.dx ?? 0) - (from.dx ?? 0)) * t,
        dy: (from.dy ?? 0) + ((to.dy ?? 0) - (from.dy ?? 0)) * t,
        fill: lerpFillArray(from.fill, to.fill, t),
    };
}

export function lerpShadowArray(from: ShadowResolved[], to: ShadowResolved[], t: number): ShadowResolved[] {
    if (from === to) return from;
    const len = Math.max(from.length, to.length);
    const result: ShadowResolved[] = [];
    for (let i = 0; i < len; i++) {
        const f = from[i];
        const tf = to[i];
        if (!f) { result.push(tf); continue; }
        if (!tf) { result.push(f); continue; }
        result.push(lerpShadow(f, tf, t));
    }
    return result;
}
