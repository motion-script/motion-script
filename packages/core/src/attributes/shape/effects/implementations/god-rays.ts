import { lerpNumber } from "@/tween/lerp";
import type { Vector2 } from "@/attributes/layout/vector2";
import { lerpVector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Crepuscular rays — bright areas smeared *outward from a point* and added back
 * over the source, so light appears to stream past whatever occludes it.
 *
 * Related to `radialBlur` in `'zoom'` style, but not the same effect and not
 * expressible as one: radial blur smears *everything*, which softens the image.
 * This smears only what is brighter than `threshold` and screens the result on
 * top, so the occluder stays sharp and only the light travels.
 */
export interface GodRaysEffect extends ModedEffect {
    type: "godRays";
    /** Additive multiplier for the ray pass. 0 = off. */
    intensity: number;
    /** 0–1 luminance cutoff — only pixels brighter than this cast rays. */
    threshold: number;
    /** How far the rays reach, as a fraction of the distance to `center`. */
    length: number;
    /** Light source in 0–1 layer coords (default middle). */
    center: Vector2;
    /** Per-step falloff; below 1 the rays fade with distance. */
    decay: number;
    /** Taps marched per pixel; higher is smoother and slower. */
    samples: number;
}

export const godRaysEffect: EffectData<GodRaysEffect> = {
    lerp: (from, to, t) => ({
        type: "godRays",
        intensity: lerpNumber(from.intensity, to.intensity, t),
        threshold: lerpNumber(from.threshold, to.threshold, t),
        length: lerpNumber(from.length, to.length, t),
        center: lerpVector2(from.center, to.center, t),
        decay: lerpNumber(from.decay, to.decay, t),
        // A quality knob, not a look — snap rather than blend to fractional taps.
        samples: t < 0.5 ? from.samples : to.samples,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.intensity === b.intensity &&
        a.threshold === b.threshold &&
        a.length === b.length &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.decay === b.decay &&
        a.samples === b.samples &&
        a.mode === b.mode,
    // Marches samples toward a point, so it needs random access to its source.
    surface: "shader",
};
