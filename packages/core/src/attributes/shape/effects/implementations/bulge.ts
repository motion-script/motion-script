import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface BulgeEffect {
    type: "bulge";
    /**
     * Distortion amount applied to the node's own content (not the backdrop):
     * positive bulges the centre outward (barrel), negative pinches it inward
     * (pincushion). Edges stay pinned. Sensible range ≈ −1…1.
     */
    strength: number;
}

export const bulgeEffect: EffectData<BulgeEffect> = {
    lerp: (from, to, t) => ({
        type: "bulge",
        strength: lerpNumber(from.strength, to.strength, t),
    }),
    equals: (a, b) => a.strength === b.strength,
};
