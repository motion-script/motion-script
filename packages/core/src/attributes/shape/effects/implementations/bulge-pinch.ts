import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface BulgePinchEffect {
    type: "bulgePinch";
    /** Distortion centre in 0–1 normalised layer coordinates ({ x: 0.5, y: 0.5 } = middle). */
    center: Vector2;
    /** Radius of the affected disc in 0–1 of the layer's smaller dimension. */
    radius: number;
    /** Distortion amount: positive bulges outward, negative pinches inward (≈ −1…1). */
    strength: number;
}

export const bulgePinchEffect: EffectData<BulgePinchEffect> = {
    lerp: (from, to, t) => ({
        type: "bulgePinch",
        center: lerpVector2(from.center, to.center, t),
        radius: lerpNumber(from.radius, to.radius, t),
        strength: lerpNumber(from.strength, to.strength, t),
    }),
    equals: (a, b) =>
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.radius === b.radius &&
        a.strength === b.strength,
};
