import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Unsharp mask — the standard sharpen: subtract a blurred copy of the content
 * from itself and add the difference back, which exaggerates local contrast at
 * edges.
 *
 *   out = c + amount · (c − blur(c, radius))
 *
 * `radius` sets the scale of detail affected (a small radius crisps fine texture,
 * a large one adds "clarity" to broad shapes); `amount` sets how hard. Past
 * ~2 the classic halo artefact shows up, which is sometimes the point.
 */
export interface SharpenEffect extends ModedEffect {
    type: "sharpen";
    /** Edge-contrast boost. 0 = off, 1 = a firm sharpen, >2 haloes. */
    amount: number;
    /** Radius of the blurred reference, in px. */
    radius: number;
}

export const sharpenEffect: EffectData<SharpenEffect> = {
    lerp: (from, to, t) => ({
        type: "sharpen",
        amount: lerpNumber(from.amount, to.amount, t),
        radius: lerpNumber(from.radius, to.radius, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.amount === b.amount && a.radius === b.radius && a.mode === b.mode,
    // Convolves a neighbourhood — this CanvasKit build has no MatrixConvolution.
    surface: "shader",
};
