import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import type { EffectData } from "../effect-data";

/**
 * Per-axis scale applied to the node's velocity before the smear is computed.
 * `'both'` (= `{x:1,y:1}`) blurs along the full motion vector; `'x'`/`'y'`
 * isolate a single axis; a {@link Vector2} gives fractional control per axis.
 */
export type MotionBlurAxis = "x" | "y" | "both" | Vector2;

/**
 * Velocity-driven motion blur. Unlike {@link DirectionalBlurEffect}, whose smear
 * is authored, this derives its direction and length from the node's actual
 * per-frame motion (sampled by the renderer), modelled on After Effects' shutter
 * angle (`length`) and shutter phase (`alignment`). A static node renders sharp.
 */
export interface MotionBlurEffect {
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
    alignment: "behind" | "centered" | "ahead" | number;
    /**
     * Quality hint for the renderer. Low values use a cheap continuous smear;
     * above the renderer's threshold it switches to discrete multi-tap
     * accumulation (After Effects' "Samples Per Frame" look).
     */
    samples: number;
    /** Multiplier on the blur length. `1` = nominal, `0` = off. */
    strength: number;
    /** Per-axis velocity scale — see {@link MotionBlurAxis}. */
    axis: MotionBlurAxis;
}

/** Resolve a {@link MotionBlurAxis} to its per-axis scale vector. */
export function resolveMotionBlurAxis(axis: MotionBlurAxis): Vector2 {
    switch (axis) {
        case "x": return { x: 1, y: 0 };
        case "y": return { x: 0, y: 1 };
        case "both": return { x: 1, y: 1 };
        default: return { x: axis.x, y: axis.y };
    }
}

/** Resolve {@link MotionBlurEffect.alignment} to a shutter-phase number in −1…1. */
export function resolveMotionBlurAlignment(alignment: MotionBlurEffect["alignment"]): number {
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
        axis: lerpVector2(resolveMotionBlurAxis(from.axis), resolveMotionBlurAxis(to.axis), t),
    }),
    equals: (a, b) =>
        a.length === b.length &&
        resolveMotionBlurAlignment(a.alignment) === resolveMotionBlurAlignment(b.alignment) &&
        a.samples === b.samples &&
        a.strength === b.strength &&
        sameAxis(a.axis, b.axis),
};

function sameAxis(a: MotionBlurAxis, b: MotionBlurAxis): boolean {
    const av = resolveMotionBlurAxis(a);
    const bv = resolveMotionBlurAxis(b);
    return av.x === bv.x && av.y === bv.y;
}
