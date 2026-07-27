import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Which convolution kernel detects the edges.
 *
 * - `"sobel"` — gradient magnitude with a centre-weighted 3×3 pair. The default:
 *   thick, smooth, noise-tolerant edges.
 * - `"prewitt"` — the same gradient pair without the centre weighting. Slightly
 *   thinner and more literal, noisier on gradients.
 * - `"laplacian"` — second derivative in one pass. Finest lines, picks up texture
 *   the gradient operators smooth over.
 */
export type EdgeKernel = "sobel" | "prewitt" | "laplacian";

/**
 * Edge detection — replaces the content with the magnitude of its own gradient,
 * so flat areas go black and boundaries light up.
 */
export interface EdgesEffect extends ModedEffect {
    type: "edges";
    /** Multiplier on the detected magnitude. 0 = off (black), 1 = as measured. */
    strength: number;
    /** Which operator measures the gradient. */
    kernel: EdgeKernel;
    /** Run the kernel per RGB channel (colour fringes) instead of on luminance. */
    colored: boolean;
}

export const edgesEffect: EffectData<EdgesEffect> = {
    lerp: (from, to, t) => ({
        type: "edges",
        strength: lerpNumber(from.strength, to.strength, t),
        kernel: t < 0.5 ? from.kernel : to.kernel,
        colored: t < 0.5 ? from.colored : to.colored,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.strength === b.strength &&
        a.kernel === b.kernel &&
        a.colored === b.colored &&
        a.mode === b.mode,
    // Convolves a 3×3 neighbourhood.
    surface: "shader",
};
