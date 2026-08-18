import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, type Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * How the blur ramp is laid out across the node.
 *
 * - `"linear"` — the ramp runs along `angle`, so the blur builds from one edge
 *   toward the other. The gradient/fade-to-blur strip under a toolbar or over
 *   the bottom of a hero image.
 * - `"radial"` — the ramp runs outward from `center`, so the middle stays sharp
 *   and the surround softens. A cheap depth-of-field / tilt-shift.
 */
export type ProgressiveBlurShape = "linear" | "radial";

/**
 * Blur whose radius *ramps* across the node instead of being uniform.
 *
 * A plain blur is a constant; this interpolates from `startRadius` to `radius`
 * between `start` and `end` along the ramp, which is what makes content appear
 * to dissolve into softness rather than simply being out of focus.
 *
 * **In `mode: 'backdrop'` this is the frosted panel with a falloff** — the
 * translucent bar whose blur fades out at its edge instead of stopping at a hard
 * line. That is the case a plain backdrop blur cannot express, and the reason
 * this effect exists.
 *
 * Cost scales with `samples`, which are spent on the *widest* part of the ramp;
 * pixels below `start` return the source untouched without sampling at all.
 */
export interface ProgressiveBlurEffect extends ModedEffect {
    type: "progressiveBlur";
    /** Blur spread in px at the far end of the ramp. 0 = off. */
    radius: number;
    /**
     * Blur spread in px at the *near* end of the ramp — where the ramp begins,
     * rather than where it arrives.
     *
     * `0` (the default, and what this effect did before the field existed) means
     * the ramp starts from sharp. A non-zero value ramps between two softnesses
     * instead of out of one, which is what a depth-of-field falloff actually
     * looks like: the near field is rarely perfectly sharp either.
     */
    startRadius: number;
    /** How the ramp is laid out. */
    shape: ProgressiveBlurShape;
    /** 0–1 position along the ramp where the blur starts building. */
    start: number;
    /** 0–1 position where the blur reaches `radius`. */
    end: number;
    /** Ramp direction in degrees; 0 = left-to-right. `"linear"` only. */
    angle: number;
    /** Ramp origin in 0–1 layer coords. `"radial"` only. */
    center: Vector2;
    /** Taps averaged at full radius; higher is smoother and slower. */
    samples: number;
}

export const progressiveBlurEffect: EffectData<ProgressiveBlurEffect> = {
    lerp: (from, to, t) => ({
        type: "progressiveBlur",
        radius: lerpNumber(from.radius, to.radius, t),
        startRadius: lerpNumber(from.startRadius, to.startRadius, t),
        shape: t < 0.5 ? from.shape : to.shape,
        start: lerpNumber(from.start, to.start, t),
        end: lerpNumber(from.end, to.end, t),
        angle: lerpNumber(from.angle, to.angle, t),
        center: lerpVector2(from.center, to.center, t),
        // A tap count has no meaningful in-between — a fractional sample count
        // would just round, so snap and keep the shader's loop bound stable.
        samples: t < 0.5 ? from.samples : to.samples,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.radius === b.radius &&
        a.startRadius === b.startRadius &&
        a.shape === b.shape &&
        a.start === b.start &&
        a.end === b.end &&
        a.angle === b.angle &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.samples === b.samples &&
        a.mode === b.mode,
    // Averages a neighbourhood whose extent varies per pixel.
    surface: "shader",
};
