import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface ZoomEffect {
    type: "zoom";
    /** Zoom centre in 0–1 normalised layer coordinates ({ x: 0.5, y: 0.5 } = middle). */
    center: Vector2;
    /**
     * Magnification factor for the backdrop beneath the node.
     * 1 = no zoom, 2 = 2× magnified, 0.5 = zoomed out to half size.
     */
    scale: number;
}

export const zoomEffect: EffectData<ZoomEffect> = {
    lerp: (from, to, t) => ({
        type: "zoom",
        center: lerpVector2(from.center, to.center, t),
        scale: lerpNumber(from.scale, to.scale, t),
    }),
    equals: (a, b) =>
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.scale === b.scale,
};
