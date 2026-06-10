import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type ScatterEffect } from "@motion-script/core";

/**
 * Scatter — randomly jitters each pixel of the node's own content, mimicking
 * After Effects' Scatter effect.
 *
 * Implemented with built-in Skia primitives (the same noise+displacement pair
 * the texture effect uses), no custom shader:
 *   1. A high-frequency fractal-noise shader supplies a per-pixel random vector;
 *      its Red/Green channels are two independent noise fields, wrapped as an
 *      ImageFilter via `ImageFilter.MakeShader`.
 *   2. `ImageFilter.MakeDisplacementMap` offsets the source (the node's layer)
 *      by `scale * (R − 0.5, G − 0.5)`, jittering each pixel by up to `±strength`.
 *
 * Per-axis direction: `MakeDisplacementMap` applies one shared `scale` to both
 * axes, so an axis can't be turned off through that argument. Instead a colour
 * matrix on the noise pins the disabled axis's channel to a constant 0.5 — which
 * the [0,1]→[−0.5,0.5] remap turns into exactly zero displacement on that axis:
 *   - horizontal → Green forced to 0.5 (no vertical movement); Red keeps noise
 *   - vertical   → Red forced to 0.5 (no horizontal movement); Green keeps noise
 *   - both       → both channels keep their noise
 *
 * Base frequency is kept near Nyquist (≈0.45 cycles/px) so adjacent pixels get
 * decorrelated offsets — grainy scatter rather than a smooth warp.
 */
export class ScatterCanvasKitEffect extends CanvasKitEffect<ScatterEffect> {
    constructor() {
        super("scatter");
    }

    makeImageFilter(effect: ScatterEffect, ck: CanvasKit): any {
        const strength = effect.strength;
        if (!(strength > 0)) return null;

        // High-frequency noise → effectively per-pixel-random R/G channels.
        const noiseShader = ck.Shader.MakeFractalNoise(0.45, 0.45, 2, 0, 0, 0);
        let displacement = ck.ImageFilter.MakeShader(noiseShader);
        noiseShader.delete();

        // Pin the disabled axis's channel to a constant 0.5 so it contributes no
        // displacement. Row order is R,G,B,A; last column is the constant offset.
        if (effect.direction !== "both") {
            // prettier-ignore
            const mask = effect.direction === "horizontal"
                ? [ // zero Green (vertical): G' = 0.5
                    1, 0, 0, 0, 0,
                    0, 0, 0, 0, 0.5,
                    0, 0, 1, 0, 0,
                    0, 0, 0, 1, 0,
                  ]
                : [ // zero Red (horizontal): R' = 0.5
                    0, 0, 0, 0, 0.5,
                    0, 1, 0, 0, 0,
                    0, 0, 1, 0, 0,
                    0, 0, 0, 1, 0,
                  ];
            const maskCF = ck.ColorFilter.MakeMatrix(mask);
            const masked = ck.ImageFilter.MakeColorFilter(maskCF, displacement);
            maskCF.delete();
            displacement.delete();
            displacement = masked;
        }

        // MakeDisplacementMap remaps each channel's 0..1 value to [-0.5,0.5] and
        // offsets the source by scale*that, so a full ±strength swing needs
        // scale = strength * 2.
        const scale = strength * 2;

        // displacement = noise filter; color = null → the node's own layer (source).
        const result = ck.ImageFilter.MakeDisplacementMap(
            ck.ColorChannel.Red,
            ck.ColorChannel.Green,
            scale,
            displacement,
            null,
        );
        displacement.delete();

        return result;
    }
}
