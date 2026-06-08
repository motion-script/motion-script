import type { CanvasKit } from "@motion-script/canvaskit";
import type { BloomEffect } from "@motion-script/core";
import { CanvasKitEffect } from "./effect";

/**
 * Bloom glow effect. Extracts pixels above `threshold`, blurs them, then
 * Screen-blends that bright-pass back onto the original layer.
 *
 * Screen blend: result = 1 − (1 − source) × (1 − bloom)
 * This ensures the bloom only brightens, never darkens, and naturally caps at white.
 *
 * MakeBlend(Screen, background=null, foreground=bloomFilter):
 *   background = null → the dynamic source (the saveLayer content)
 *   foreground = blurred threshold pass of the same source
 */
export class BloomCanvasKitEffect extends CanvasKitEffect<BloomEffect> {
    constructor() {
        super("bloom");
    }

    makeImageFilter(effect: BloomEffect, ck: CanvasKit): any {
        if (effect.radius <= 0 || effect.intensity <= 0) return null;

        const t = Math.max(0, Math.min(1, effect.threshold));
        const sigma = effect.radius / 2;

        // Color matrix that zeroes out pixels below threshold and rescales the rest.
        // Each channel: output = max(0, input − t) / (1 − t)
        // In 5×4 matrix terms (row-major, applied to non-premultiplied colors):
        //   output_R = 1/(1-t) * input_R + (-t/(1-t))
        const scale = t < 1 ? 1 / (1 - t) : 1;
        const bias = -t * scale;

        // prettier-ignore
        const thresholdMatrix = [
            scale, 0,     0,     0, bias,
            0,     scale, 0,     0, bias,
            0,     0,     scale, 0, bias,
            0,     0,     0,     1, 0,
        ];

        const thresholdCF = ck.ColorFilter.MakeMatrix(thresholdMatrix);
        const thresholdIF = ck.ImageFilter.MakeColorFilter(thresholdCF, null);
        thresholdCF.delete();

        // Blur the bright pass.
        const blurIF = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, thresholdIF);
        thresholdIF.delete();

        // Scale the bloom pass by intensity using another color matrix.
        let bloomIF: any = blurIF;
        if (effect.intensity !== 1) {
            const i = effect.intensity;
            // prettier-ignore
            const intensityMatrix = [
                i, 0, 0, 0, 0,
                0, i, 0, 0, 0,
                0, 0, i, 0, 0,
                0, 0, 0, 1, 0,
            ];
            const intensityCF = ck.ColorFilter.MakeMatrix(intensityMatrix);
            bloomIF = ck.ImageFilter.MakeColorFilter(intensityCF, blurIF);
            intensityCF.delete();
            blurIF.delete();
        }

        // Screen-blend the bloom pass onto the source layer.
        // background = null → source layer; foreground = bloomIF
        const result = ck.ImageFilter.MakeBlend(ck.BlendMode.Screen, null, bloomIF);
        bloomIF.delete();
        return result;
    }
}
