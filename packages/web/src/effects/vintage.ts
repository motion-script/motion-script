import type { CanvasKit } from "@motion-script/canvaskit";
import type { VintageEffect } from "@motion-script/core";
import { CanvasKitEffect } from "./effect";

/**
 * Vintage / film-look colour grading effect.
 *
 * Interpolates between the identity matrix and a sepia+desaturate matrix by
 * `amount`, then shifts the colour temperature via `warmth`. Applied as a
 * single colour-matrix ImageFilter so it composes cheaply with other effects.
 *
 * Sepia reference (ITU-R BT.601 luma weights for desaturation):
 *   R' = 0.393R + 0.769G + 0.189B
 *   G' = 0.349R + 0.686G + 0.168B
 *   B' = 0.272R + 0.534G + 0.131B
 */
export class VintageCanvasKitEffect extends CanvasKitEffect<VintageEffect> {
    constructor() {
        super("vintage");
    }

    makeImageFilter(effect: VintageEffect, ck: CanvasKit): any {
        if (effect.amount <= 0 && effect.warmth === 0) return null;

        const a = Math.max(0, Math.min(1, effect.amount));
        const w = Math.max(-1, Math.min(1, effect.warmth));

        // Lerp between identity and sepia per channel.
        const lerp = (identity: number, sepia: number) => identity + (sepia - identity) * a;

        // Sepia values
        const sr = [0.393, 0.769, 0.189];
        const sg = [0.349, 0.686, 0.168];
        const sb = [0.272, 0.534, 0.131];

        // Warmth shifts R up / B down (positive) or R down / B up (negative).
        const warmR = w > 0 ? w * 0.15 : 0;
        const warmB = w < 0 ? -w * 0.15 : 0;
        const coolR = w < 0 ? -w * 0.05 : 0;
        const coolB = w > 0 ? w * 0.05 : 0;

        // prettier-ignore
        const matrix = [
            lerp(1, sr[0]), lerp(0, sr[1]), lerp(0, sr[2]), 0,  warmR - coolR,
            lerp(0, sg[0]), lerp(1, sg[1]), lerp(0, sg[2]), 0,  0,
            lerp(0, sb[0]), lerp(0, sb[1]), lerp(1, sb[2]), 0, -warmB + coolB,
            0,              0,              0,              1,  0,
        ];

        const cf = ck.ColorFilter.MakeMatrix(matrix);
        const result = ck.ImageFilter.MakeColorFilter(cf, null);
        cf.delete();
        return result;
    }
}
