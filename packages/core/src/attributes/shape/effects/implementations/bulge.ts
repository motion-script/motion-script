import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

export interface BulgeEffect extends ModedEffect {
    type: "bulge";
    /**
     * Distortion amount applied to the node's own content (not the backdrop):
     * positive bulges the centre outward (barrel), negative pinches it inward
     * (pincushion). Edges stay pinned. Sensible range ≈ −1…1.
     */
    strength: number;
    /** Lens centre in 0–1 normalised layer coordinates ({ x: 0.5, y: 0.5 } = middle). */
    center: Vector2;
}

export const bulgeEffect: EffectData<BulgeEffect> = {
    lerp: (from, to, t) => ({
        type: "bulge",
        strength: lerpNumber(from.strength, to.strength, t),
        center: lerpVector2(from.center, to.center, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.strength === b.strength &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.mode === b.mode,
    // Warps its source: samples a displaced texel per fragment.
    surface: "shader",
};
