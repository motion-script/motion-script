import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

/** Axis (or axes) along which {@link ScatterEffect} jitters pixels. */
export type ScatterDirection = "horizontal" | "vertical" | "both";

export interface ScatterEffect {
    type: "scatter";
    /**
     * Maximum random pixel displacement applied per-pixel. Larger values smear
     * the node's own content further (After Effects' "Scatter Amount"). 0 = off.
     */
    strength: number;
    /** Which axis (or axes) pixels are displaced along. */
    direction: ScatterDirection;
}

export const scatterEffect: EffectData<ScatterEffect> = {
    lerp: (from, to, t) => ({
        type: "scatter",
        strength: lerpNumber(from.strength, to.strength, t),
        // direction is discrete — snap at the midpoint like other enum-valued effects.
        direction: t < 0.5 ? from.direction : to.direction,
    }),
    equals: (a, b) => a.strength === b.strength && a.direction === b.direction,
};
