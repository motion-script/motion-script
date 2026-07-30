import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, type Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Kaleidoscope — the content is folded into `segments` mirrored wedges around
 * `center`, so one slice of the source is repeated around a circle.
 *
 * Only the wedge starting at `angle` is ever read; every other segment is that
 * same wedge reflected or rotated into place. That is why rotating `angle`
 * animates so well — the pattern stays locked while *different source material*
 * sweeps through the wedge, which is the effect people actually want and is not
 * the same as rotating the node.
 *
 * `segments` counts the mirrored pairs, so 6 gives the familiar snowflake. It is
 * discrete: a tween snaps rather than passing through a fractional fold, which
 * would tear.
 */
export interface KaleidoscopeEffect extends ModedEffect {
    type: "kaleidoscope";
    /** Number of mirrored wedges around the circle. Below 2 the effect is a no-op. */
    segments: number;
    /** Rotation of the wedge pattern in degrees — animate it to sweep the source. */
    angle: number;
    /** Fold origin in 0–1 layer coords. */
    center: Vector2;
    /** Radial offset of the sampled wedge, as a fraction of the half-extent. */
    offset: number;
    /**
     * 0–1 blend from the original content to the fully folded pattern.
     *
     * `segments` is discrete, so it cannot be tweened up from 1 to ramp the
     * effect on — it would snap. This is the continuous handle that lets a
     * kaleidoscope be animated in, the same way `duotone` and `bitCrush` blend
     * back toward their source.
     */
    amount: number;
}

export const kaleidoscopeEffect: EffectData<KaleidoscopeEffect> = {
    lerp: (from, to, t) => ({
        type: "kaleidoscope",
        // Fold count is discrete — a fractional wedge cannot tile the circle, so
        // it would tear at the seam. Snap like every other enum-valued field.
        segments: t < 0.5 ? from.segments : to.segments,
        angle: lerpNumber(from.angle, to.angle, t),
        center: lerpVector2(from.center, to.center, t),
        offset: lerpNumber(from.offset, to.offset, t),
        amount: lerpNumber(from.amount, to.amount, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.segments === b.segments &&
        a.angle === b.angle &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.offset === b.offset &&
        a.amount === b.amount &&
        a.mode === b.mode,
    // Resamples the source at a reflected position.
    surface: "shader",
};
