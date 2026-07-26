import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Size of the Bayer threshold matrix: 2×2, 4×4 or 8×8. Bigger matrices carry
 * more distinct threshold levels, so the pattern is finer and the apparent tonal
 * range wider — 2 is a blunt checkerboard, 8 the smooth classic ordered dither.
 */
export type DitherMatrix = 2 | 4 | 8;

/**
 * Ordered (Bayer) dithering — quantize the image to `levels` tones per channel,
 * but offset each pixel's rounding by a repeating threshold matrix first. The
 * error is traded for a fixed crosshatch pattern, which is how 8-bit hardware
 * faked gradients and why the result reads as retro rather than as banding.
 *
 * Contrast with `posterize`, which quantizes with no threshold pattern and so
 * produces flat bands.
 */
export interface DitherEffect extends ModedEffect {
    type: "dither";
    /** Output tones per channel (≥ 2). 2 is pure 1-bit-per-channel. */
    levels: number;
    /** Bayer matrix size. */
    matrix: DitherMatrix;
    /** Pattern cell size in px — >1 gives chunky, low-res-looking dither. */
    scale: number;
    /** Dither luminance to black and white instead of per channel. */
    monochrome: boolean;
}

export const ditherEffect: EffectData<DitherEffect> = {
    lerp: (from, to, t) => ({
        type: "dither",
        levels: lerpNumber(from.levels, to.levels, t),
        matrix: t < 0.5 ? from.matrix : to.matrix,
        scale: lerpNumber(from.scale, to.scale, t),
        monochrome: t < 0.5 ? from.monochrome : to.monochrome,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.levels === b.levels &&
        a.matrix === b.matrix &&
        a.scale === b.scale &&
        a.monochrome === b.monochrome &&
        a.mode === b.mode,
    // The threshold depends on the pixel's position in the Bayer cell.
    surface: "shader",
};
