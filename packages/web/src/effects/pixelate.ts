import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type PixelateEffect } from "@motion-script/core";

export class PixelateCanvasKitEffect extends CanvasKitEffect<PixelateEffect> {
    constructor() {
        super("pixelate");
    }

    /**
     * Pixelation via two MakeMatrixTransform passes:
     *   1. Downsample with nearest-neighbor (every Nth pixel sampled → coarse grid)
     *   2. Upsample with nearest-neighbor (each coarse pixel blown up to an NxN block)
     *
     * horizontalBlocks / verticalBlocks are block sizes in pixels (1 = no pixelation).
     */
    makeImageFilter(effect: PixelateEffect, ck: CanvasKit, _width: number, _height: number): any {
        const blockW = Math.max(1, effect.horizontalBlocks);
        const blockH = Math.max(1, effect.verticalBlocks);

        const nearest = { filter: ck.FilterMode.Nearest };

        // Step 1: output(x,y) = layer(x * blockW, y * blockH)  — coarse subsampling
        const step1 = ck.ImageFilter.MakeMatrixTransform(
            [1 / blockW, 0, 0, 0, 1 / blockH, 0, 0, 0, 1],
            nearest,
            null,
        );

        // Step 2: output(x,y) = step1(x / blockW, y / blockH) — nearest-neighbor upscale
        // Pixels 0..blockW-1 all round to step1(0) → same block color.
        const step2 = ck.ImageFilter.MakeMatrixTransform(
            [blockW, 0, 0, 0, blockH, 0, 0, 0, 1],
            nearest,
            step1,
        );

        step1.delete();
        return step2;
    }
}
