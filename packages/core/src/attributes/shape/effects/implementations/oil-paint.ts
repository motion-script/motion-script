import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Kuwahara filter — the painterly one.
 *
 * Each pixel looks at four overlapping quadrant windows and takes the mean of
 * whichever is *flattest*. Averaging within a region but never across a boundary
 * is what makes it read as brushwork: flat areas smooth into strokes while edges
 * stay crisp, where a plain blur would soften both.
 *
 * Cost grows with the square of `radius` — four windows of `(radius+1)²` samples
 * each — so this is the most expensive effect in the set by a wide margin.
 */
export interface OilPaintEffect extends ModedEffect {
    type: "oilPaint";
    /** Window radius in px. Brush size, and the dominant cost. 0 = off. */
    radius: number;
}

export const oilPaintEffect: EffectData<OilPaintEffect> = {
    lerp: (from, to, t) => ({
        type: "oilPaint",
        radius: lerpNumber(from.radius, to.radius, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.radius === b.radius && a.mode === b.mode,
    // Reads a large neighbourhood per pixel.
    surface: "shader",
};
