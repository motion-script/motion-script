import { lerpNumber } from "@/tween/lerp";
import type { Vector2 } from "@/attributes/layout/vector2";
import { lerpVector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Which way the samples are smeared around {@link RadialBlurEffect.center}.
 *
 * - `"zoom"` — along the radius: a rush toward or away from the centre.
 * - `"spin"` — along the tangent: rotational motion about the centre.
 *
 * (After Effects calls this the effect's "Type"; here that name belongs to the
 * effect discriminator, so the field is `style`.)
 */
export type RadialBlurStyle = "zoom" | "spin";

/**
 * After Effects' Radial Blur — the source is sampled repeatedly along a path
 * that radiates from (`zoom`) or circles (`spin`) a centre point, and the taps
 * are averaged. The centre stays sharp and the smear grows with distance, which
 * is what makes it read as speed rather than as softness.
 */
export interface RadialBlurEffect extends ModedEffect {
    type: "radialBlur";
    /** Smear length as a fraction of the node's half-extent (zoom) or of a turn (spin). 0 = off. */
    amount: number;
    /** Radial rush or rotational streak. */
    style: RadialBlurStyle;
    /** Centre of the blur in 0–1 layer coords (default middle). */
    center: Vector2;
    /** Taps averaged per pixel; higher is smoother and slower. */
    samples: number;
}

export const radialBlurEffect: EffectData<RadialBlurEffect> = {
    lerp: (from, to, t) => ({
        type: "radialBlur",
        amount: lerpNumber(from.amount, to.amount, t),
        style: t < 0.5 ? from.style : to.style,
        center: lerpVector2(from.center, to.center, t),
        // Sample count is a quality knob, not a look — snap rather than blend to
        // fractional taps the shader would round anyway.
        samples: t < 0.5 ? from.samples : to.samples,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amount === b.amount &&
        a.style === b.style &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.samples === b.samples &&
        a.mode === b.mode,
    // Resamples along a path per pixel.
    surface: "shader",
};
