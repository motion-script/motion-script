import type { CanvasKit } from "@motion-script/canvaskit";
import { type InvertEffect } from "@motion-script/core";
import { CanvasKitEffect } from "./effect";

// 4x5 row-major identity color matrix (Skia format).
// prettier-ignore
const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];

// ITU-R BT.709 luminance weights.
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * Per-channel "fully inverted" colour matrices. Each is lerped against
 * `IDENTITY` by `strength` to produce the final matrix.
 */
function fullMatrix(channel: InvertEffect["channel"]): number[] {
    switch (channel) {
        case "red":
            // prettier-ignore
            return [
                -1, 0, 0, 0, 1,
                 0, 1, 0, 0, 0,
                 0, 0, 1, 0, 0,
                 0, 0, 0, 1, 0,
            ];
        case "green":
            // prettier-ignore
            return [
                1,  0, 0, 0, 0,
                0, -1, 0, 0, 1,
                0,  0, 1, 0, 0,
                0,  0, 0, 1, 0,
            ];
        case "blue":
            // prettier-ignore
            return [
                1, 0,  0, 0, 0,
                0, 1,  0, 0, 0,
                0, 0, -1, 0, 1,
                0, 0,  0, 1, 0,
            ];
        case "alpha":
            // prettier-ignore
            return [
                1, 0, 0,  0, 0,
                0, 1, 0,  0, 0,
                0, 0, 1,  0, 0,
                0, 0, 0, -1, 1,
            ];
        case "hue":
            // 180° luma-preserving hue rotation (cos = -1, sin = 0):
            // a_ij = 2*lum_j - identity_ij
            // prettier-ignore
            return [
                2 * LR - 1, 2 * LG,     2 * LB,     0, 0,
                2 * LR,     2 * LG - 1, 2 * LB,     0, 0,
                2 * LR,     2 * LG,     2 * LB - 1, 0, 0,
                0,          0,          0,          1, 0,
            ];
        case "luminance":
            // Shift each channel by (1 - 2*L) where L = LR*R + LG*G + LB*B,
            // inverting perceived luminance while preserving chroma.
            // prettier-ignore
            return [
                1 - 2 * LR,    -2 * LG,    -2 * LB,    0, 1,
                   -2 * LR, 1 - 2 * LG,    -2 * LB,    0, 1,
                   -2 * LR,    -2 * LG, 1 - 2 * LB,    0, 1,
                0,             0,          0,          1, 0,
            ];
        case "rgba":
        default:
            // prettier-ignore
            return [
                -1,  0,  0, 0, 1,
                 0, -1,  0, 0, 1,
                 0,  0, -1, 0, 1,
                 0,  0,  0, 1, 0,
            ];
    }
}

/** Colour inversion via a single colour-matrix ImageFilter, lerped between identity (strength=0) and a fully inverted channel (strength=1). */
export class InvertCanvasKitEffect extends CanvasKitEffect<InvertEffect> {
    constructor() {
        super("invert");
    }

    makeImageFilter(effect: InvertEffect, ck: CanvasKit): any {
        const s = Math.max(0, Math.min(1, effect.strength));
        if (s === 0) return null;

        const target = fullMatrix(effect.channel);
        const matrix = IDENTITY.map((identityValue, i) => identityValue + (target[i] - identityValue) * s);

        const colorFilter = ck.ColorFilter.MakeMatrix(matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    }
}
