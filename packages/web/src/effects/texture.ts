import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type TextureEffect } from "@motion-script/core";

export class TextureCanvasKitEffect extends CanvasKitEffect<TextureEffect> {
    constructor() {
        super("texture");
    }

    /**
     * Figma-style "texture" spatter: the node's silhouette keeps a solid core that
     * dissolves *gradually* into scattered grain toward its edge — the grain density
     * thins with distance, sparse at the outer reach and dense near the interior.
     *
     * This mirrors the reference fragment shader, whose dissolve compares per-pixel
     * noise against a density that ramps with distance from the shape edge. This
     * CanvasKit build can't feed the dynamic layer into a RuntimeEffect as a child
     * shader, so the same graded result is assembled from source-reading filters:
     *
     *   1. `ramp`      = MakeBlur(spread) softens the silhouette into a smooth alpha
     *      gradient at the edge — the distance-graded density `t` from the shader.
     *   2. `scattered` = MakeDisplacementMap pushes that *soft ramp* around by fractal
     *      noise. Because the input is a gradient (not a hard edge), each grain's
     *      survival depends on the local ramp height → density that thins with
     *      distance, instead of a uniform-density band.
     *   3. A steep alpha contrast curve (A' = 3·A − 1) resolves the chewed gradient
     *      into crisp grain specks while preserving the graded falloff.
     *
     * Param mapping (mirrors the reference shader's controls):
     *   radius          → spread: how far the dissolve reaches inward from the edge.
     *   size.x / size.y → grain cell size; larger = chunkier grain (lower frequency).
     */
    makeImageFilter(effect: TextureEffect, ck: CanvasKit): any {
        const grainX = Math.max(1, effect.size.x);
        const grainY = Math.max(1, effect.size.y);
        const spread = Math.max(0, effect.radius);

        // No spread → nothing to dissolve; let the layer through untouched.
        if (spread <= 0) return null;

        // Grain frequency is the inverse of grain size, clamped to the range Skia's
        // fractal noise accepts. Axes are independent so size can stretch the grain.
        const fx = Math.min(0.9, Math.max(0.02, 1 / grainX));
        const fy = Math.min(0.9, Math.max(0.02, 1 / grainY));

        // 1. Soft distance ramp: blur the silhouette so its alpha gradients across
        //    the spread zone (high inside → 0 outside).
        const sigma = spread / 2;
        const ramp = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null);

        // 2. Scatter the ramp by fractal noise; displacing a gradient yields grain
        //    whose density follows the local ramp height.
        const noiseShader = ck.Shader.MakeFractalNoise(fx, fy, 4, 0, 0, 0);
        const displacement = ck.ImageFilter.MakeShader(noiseShader);
        noiseShader.delete();

        const scattered = ck.ImageFilter.MakeDisplacementMap(
            ck.ColorChannel.Red,
            ck.ColorChannel.Green,
            spread,
            displacement,
            ramp,
        );
        ramp.delete();
        displacement.delete();

        // 3. Contrast the chewed gradient into crisp grain: A' = clamp(3·A − 1).
        //    RGB rows are identity so the source colour is preserved.
        const contrast = ck.ColorFilter.MakeMatrix([
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, 3, -1,
        ]);
        const filter = ck.ImageFilter.MakeColorFilter(contrast, scattered);
        contrast.delete();
        scattered.delete();
        return filter;
    }
}
