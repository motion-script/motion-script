import { lerpNumber } from "@/tween/lerp";
import { lerpVector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData, EffectAxis } from "../effect-data";
import { resolveEffectAxis, sameEffectAxis } from "../effect-data";

/** Shutter phase presets — see {@link MotionBlurEffect.alignment}. */
export type MotionBlurAlignment = "behind" | "centered" | "ahead" | number;

/**
 * Velocity-driven motion blur. Unlike {@link DirectionalBlurEffect}, whose smear
 * is authored, this derives its direction and length from the node's actual
 * per-frame motion (sampled by the renderer), modelled on After Effects' shutter
 * angle (`length`) and shutter phase (`alignment`). A static node renders sharp.
 */
export interface MotionBlurEffect extends ModedEffect {
    type: "motionBlur";
    /**
     * Shutter "openness" as a percentage, the user-friendly form of a shutter
     * angle. `100` ≈ 360° = a smear spanning the node's full per-frame
     * displacement; `0` = no blur.
     */
    length: number;
    /**
     * Shutter phase — where the smear sits relative to the node's current
     * position along its motion. `'behind'` (−1) trails the motion, `'centered'`
     * (0) straddles it, `'ahead'` (1) leads it; a number is clamped to −1…1.
     */
    alignment: MotionBlurAlignment;
    /**
     * Quality hint for the renderer. Low values use a cheap continuous smear;
     * above the renderer's threshold it switches to discrete multi-tap
     * accumulation (After Effects' "Samples Per Frame" look).
     */
    samples: number;
    /** Multiplier on the blur length. `1` = nominal, `0` = off. */
    strength: number;
    /** Per-axis velocity scale — see {@link EffectAxis}. */
    axis: EffectAxis;
}

/** Resolve {@link MotionBlurEffect.alignment} to a shutter-phase number in −1…1. */
export function resolveMotionBlurAlignment(alignment: MotionBlurAlignment): number {
    switch (alignment) {
        case "behind": return -1;
        case "centered": return 0;
        case "ahead": return 1;
        default: return Math.max(-1, Math.min(1, alignment));
    }
}

export const motionBlurEffect: EffectData<MotionBlurEffect> = {
    lerp: (from, to, t) => ({
        type: "motionBlur",
        length: lerpNumber(from.length, to.length, t),
        // alignment lerps numerically once resolved to a phase; string presets
        // resolve to their numeric phase so e.g. 'behind' → 'ahead' sweeps.
        alignment: lerpNumber(resolveMotionBlurAlignment(from.alignment), resolveMotionBlurAlignment(to.alignment), t),
        samples: lerpNumber(from.samples, to.samples, t),
        strength: lerpNumber(from.strength, to.strength, t),
        axis: lerpVector2(resolveEffectAxis(from.axis), resolveEffectAxis(to.axis), t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.length === b.length &&
        resolveMotionBlurAlignment(a.alignment) === resolveMotionBlurAlignment(b.alignment) &&
        a.samples === b.samples &&
        a.strength === b.strength &&
        sameEffectAxis(a.axis, b.axis) &&
        a.mode === b.mode,
};
