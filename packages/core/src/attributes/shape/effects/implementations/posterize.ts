import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * After Effects-style Posterize.
 *
 * Quantizes each colour channel into `levels` evenly-spaced brightness steps, so
 * smooth gradients collapse into flat bands. `levels` is the number of tones per
 * channel (matching AE's single "Level" parameter): 2 → pure two-tone per
 * channel, higher values keep more detail. Below 2 there is nothing to band, so
 * the effect is a no-op.
 */
export interface PosterizeEffect extends ModedEffect {
    type: "posterize";
    /** Number of brightness levels per channel (AE "Level", ≥ 2). */
    levels: number;
}

export const posterizeEffect: EffectData<PosterizeEffect> = {
    lerp: (from, to, t) => ({
        type: "posterize",
        levels: lerpNumber(from.levels, to.levels, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.levels === b.levels && a.mode === b.mode,
    // Reads its source texel-by-texel through a banding shader.
    surface: "shader",
};
