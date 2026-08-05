import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Size of the Bayer threshold matrix: 2×2, 4×4 or 8×8. Bigger matrices carry
 * more distinct threshold levels, so the pattern is finer and the apparent tonal
 * range wider — 2 is a blunt checkerboard, 8 the smooth classic ordered dither.
 */
export type DitherMatrix = 2 | 4 | 8;

/**
 * Where a pixel's threshold comes from.
 *
 * - `'bayer'` — the recursive ordered matrix. Its lattice *is* the look: the
 *   crosshatch is visible at every density, which is what reads as 8-bit and
 *   what makes it beat against the pixel grid at some `scale`s.
 * - `'blue'` — a void-and-cluster blue-noise field. Every density stays
 *   homogeneous, so the tone is reproduced with no lattice and no moiré. Pick
 *   this when the dither should be texture rather than pattern.
 *
 * `matrix` only applies to `'bayer'`.
 */
export type DitherNoise = 'bayer' | 'blue';

/**
 * Ordered dithering — quantize the image to `levels` tones per channel, but
 * offset each pixel's rounding by a threshold pattern first. The error is traded
 * for texture instead of banding, which is how 8-bit hardware faked gradients.
 *
 * `noise` picks which pattern: the classic Bayer matrix (visible crosshatch, the
 * retro look) or blue noise (no visible structure at any density).
 *
 * Contrast with `posterize`, which quantizes with no threshold pattern and so
 * produces flat bands.
 */
export interface DitherEffect extends ModedEffect {
    type: "dither";
    /** Output tones per channel (≥ 2). 2 is pure 1-bit-per-channel. */
    levels: number;
    /** Bayer matrix size. Ignored when `noise` is `'blue'`. */
    matrix: DitherMatrix;
    /** Pattern cell size in px — >1 gives chunky, low-res-looking dither. */
    scale: number;
    /** Dither luminance to black and white instead of per channel. */
    monochrome: boolean;
    /** Threshold source: ordered Bayer matrix, or blue noise. */
    noise: DitherNoise;
}

export const ditherEffect: EffectData<DitherEffect> = {
    lerp: (from, to, t) => ({
        type: "dither",
        levels: lerpNumber(from.levels, to.levels, t),
        matrix: t < 0.5 ? from.matrix : to.matrix,
        scale: lerpNumber(from.scale, to.scale, t),
        monochrome: t < 0.5 ? from.monochrome : to.monochrome,
        // Two different threshold fields have no meaningful blend, so this
        // hard-cuts like every other discrete effect option.
        noise: t < 0.5 ? from.noise : to.noise,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.levels === b.levels &&
        a.matrix === b.matrix &&
        a.scale === b.scale &&
        a.monochrome === b.monochrome &&
        a.noise === b.noise &&
        a.mode === b.mode,
    // The threshold depends on the pixel's position in the pattern.
    surface: "shader",
};
