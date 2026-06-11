import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type PixelateEffect } from "@motion-script/core";

export class PixelateCanvasKitEffect extends CanvasKitEffect<PixelateEffect> {
    constructor() {
        super("pixelate");
    }

    /**
     * After Effects-style Mosaic via two MakeMatrixTransform passes:
     *   1. Downsample so the grid has exactly `horizontalBlocks × verticalBlocks`
     *      cells (every block collapses to one representative pixel).
     *   2. Upsample that coarse grid back to full size, blowing each cell up to a
     *      block.
     *
     * `horizontalBlocks` / `verticalBlocks` are *block counts* across the layer
     * (AE "Horizontal/Vertical Blocks"), so a count equal to the surface size on
     * that axis is pristine. The block size in pixels is therefore the surface
     * size divided by the block count.
     *
     * `sharpColors` mirrors AE's "Sharp Colors" checkbox: when true each block is
     * a single solid colour (nearest-neighbour upsample); when false the block
     * colours are smoothly interpolated (linear upsample).
     */
    makeImageFilter(effect: PixelateEffect, ck: CanvasKit, width: number, height: number): any {
        // Block size in pixels = surface size / number of blocks. Clamp the
        // block count to at least 1 (a whole-layer block) and never more than
        // the surface size (one block per pixel → no pixelation).
        const blocksX = Math.max(1, Math.min(width, effect.horizontalBlocks));
        const blocksY = Math.max(1, Math.min(height, effect.verticalBlocks));
        const blockW = width / blocksX;
        const blockH = height / blocksY;

        const nearest = { filter: ck.FilterMode.Nearest };
        const upsample = effect.sharpColors
            ? { filter: ck.FilterMode.Nearest }
            : { filter: ck.FilterMode.Linear };

        // Step 1: output(x,y) = layer(x * blockW, y * blockH) — coarse subsampling
        // onto the blocksX × blocksY grid.
        const step1 = ck.ImageFilter.MakeMatrixTransform(
            [1 / blockW, 0, 0, 0, 1 / blockH, 0, 0, 0, 1],
            nearest,
            null,
        );

        // Step 2: output(x,y) = step1(x / blockW, y / blockH) — upscale each grid
        // cell back to a full block. Nearest = solid blocks, Linear = blended.
        const step2 = ck.ImageFilter.MakeMatrixTransform(
            [blockW, 0, 0, 0, blockH, 0, 0, 0, 1],
            upsample,
            step1,
        );

        step1.delete();
        return step2;
    }
}
