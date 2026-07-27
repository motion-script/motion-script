import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Film grain — per-pixel noise blended into the node's own content.
 *
 * The noise is *signed* (it lightens and darkens around the source value) and
 * scaled by the local alpha, so it never bleeds past the silhouette and never
 * shifts the average exposure.
 *
 * Grain that doesn't move reads as a texture rather than as film, so
 * {@link animated} re-seeds the field every frame from the node's elapsed time.
 * For a deterministic render (e.g. a pixel-diff test) leave it off and animate
 * {@link seed} instead — a tween over `seed` gives the same shimmer frame-locked
 * to the timeline.
 */
export interface GrainEffect extends ModedEffect {
    type: "grain";
    /** 0–1 noise amplitude. 0 = off. */
    amount: number;
    /** Grain cell size in px — 1 is per-pixel, higher is chunkier. */
    size: number;
    /** Random field offset. Animate it (or set `animated`) to make the grain crawl. */
    seed: number;
    /** Re-seed every frame from the node's elapsed time. */
    animated: boolean;
    /** Per-channel noise (colour speckle) instead of one luminance value. */
    colored: boolean;
}

export const grainEffect: EffectData<GrainEffect> = {
    lerp: (from, to, t) => ({
        type: "grain",
        amount: lerpNumber(from.amount, to.amount, t),
        size: lerpNumber(from.size, to.size, t),
        seed: lerpNumber(from.seed, to.seed, t),
        animated: t < 0.5 ? from.animated : to.animated,
        colored: t < 0.5 ? from.colored : to.colored,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amount === b.amount &&
        a.size === b.size &&
        a.seed === b.seed &&
        a.animated === b.animated &&
        a.colored === b.colored &&
        a.mode === b.mode,
    // Hashes each pixel's position into a noise value.
    surface: "shader",
};
