import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

/**
 * After Effects-style Posterize.
 *
 * Quantizes each colour channel into `level` evenly-spaced brightness steps, so
 * smooth gradients collapse into flat bands. `level` is the number of tones per
 * channel (matching AE's single "Level" parameter): 2 → pure two-tone per
 * channel, higher values keep more detail. Below 2 there is nothing to band, so
 * the effect is a no-op.
 */
export interface PosterizeEffect {
    type: "posterize";
    /** Number of brightness levels per channel (AE "Level", ≥ 2). */
    level: number;
}

export const posterizeEffect: EffectData<PosterizeEffect> = {
    lerp: (from, to, t) => ({
        type: "posterize",
        level: lerpNumber(from.level, to.level, t),
    }),
    equals: (a, b) => a.level === b.level,
};
