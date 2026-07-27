import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData, EffectAxis } from "../effect-data";
import { sameEffectAxis } from "../effect-data";

/**
 * Datamosh-style tearing: the content is cut into bands and each band is
 * displaced by a random amount.
 *
 * `density` is what separates this from noise — only that fraction of bands
 * move at all, so the image stays readable and the tear reads as a fault rather
 * than as static. Turn it to 1 and every band shifts.
 *
 * The displacement is a pure function of the band index and `seed`, so a frame
 * always re-renders identically. Animate `seed` (in whole steps) to make the
 * glitch jump between distinct states rather than sliding smoothly, which is
 * what makes it read as digital.
 */
export interface BlockDisplaceEffect extends ModedEffect {
    type: "blockDisplace";
    /** Maximum displacement in px. 0 = off. */
    amount: number;
    /** Band thickness in px. */
    size: number;
    /** 0–1 fraction of bands that move at all. */
    density: number;
    /** Random field offset — step it to jump between glitch states. */
    seed: number;
    /** Which way bands slide, and how they are cut: `'x'` = horizontal tears. */
    axis: EffectAxis;
}

export const blockDisplaceEffect: EffectData<BlockDisplaceEffect> = {
    lerp: (from, to, t) => ({
        type: "blockDisplace",
        amount: lerpNumber(from.amount, to.amount, t),
        size: lerpNumber(from.size, to.size, t),
        density: lerpNumber(from.density, to.density, t),
        seed: lerpNumber(from.seed, to.seed, t),
        axis: t < 0.5 ? from.axis : to.axis,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amount === b.amount &&
        a.size === b.size &&
        a.density === b.density &&
        a.seed === b.seed &&
        sameEffectAxis(a.axis, b.axis) &&
        a.mode === b.mode,
    // Resamples the source at a displaced position.
    surface: "shader",
};
