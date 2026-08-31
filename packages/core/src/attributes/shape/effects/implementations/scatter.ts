import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData, EffectAxis } from "../effect-data";
import { sameEffectAxis } from "../effect-data";

export interface ScatterEffect extends ModedEffect {
    type: "scatter";
    /**
     * Maximum random pixel displacement applied per-pixel. Larger values smear
     * the node's own content further (After Effects' "Scatter Amount"). 0 = off.
     */
    strength: number;
    /** Which axis (or axes) pixels are displaced along. */
    axis: EffectAxis;
}

export const scatterEffect: EffectData<ScatterEffect> = {
    lerp: (from, to, t) => ({
        type: "scatter",
        strength: lerpNumber(from.strength, to.strength, t),
        // axis is discrete — snap at the midpoint like other enum-valued effects.
        axis: t < 0.5 ? from.axis : to.axis,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.strength === b.strength && sameEffectAxis(a.axis, b.axis) && a.mode === b.mode,
    // Displaces each pixel by a hash of its position, so it needs random access
    // to its source. It was realised as a displacement-map ImageFilter until the
    // filter path's layer snapping was found to re-roll the field whenever the
    // node stood on a fractional pixel — see the renderer's `scatter` handler,
    // which carries the full account.
    surface: "shader",
};
