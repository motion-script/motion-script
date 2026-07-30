import type { EffectHandler } from "./handler";
import { resolveEffectAxis, type ScatterEffect } from "@motion-script/core";

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
 * Per-axis weighting: `MakeDisplacementMap` applies one shared `scale` to both
 * axes, so an axis can't be attenuated through that argument. Instead a colour
 * matrix pulls each noise channel toward the constant 0.5 by that axis's weight —
 * and the [0,1]→[−0.5,0.5] remap turns 0.5 into exactly zero displacement:
 *   - `'x'`  → Green pinned to 0.5 (no vertical movement); Red keeps its noise
 *   - `'y'`  → Red pinned to 0.5 (no horizontal movement); Green keeps its noise
 *   - `'both'` → both channels keep their noise
 *   - a `Vector2` scales each axis independently (0.5 = half-amplitude jitter)
 *
 * Base frequency is kept near Nyquist (≈0.45 cycles/px) so adjacent pixels get
 * decorrelated offsets — grainy scatter rather than a smooth warp.
 */
export const scatterEffectHandler: EffectHandler<ScatterEffect> = {
    type: "scatter",

    makeImageFilter(effect, ck) {
        const strength = effect.strength;
        if (!(strength > 0)) return null;

        // High-frequency noise → effectively per-pixel-random R/G channels.
        const noiseShader = ck.Shader.MakeFractalNoise(0.45, 0.45, 2, 0, 0, 0);
        let displacement = ck.ImageFilter.MakeShader(noiseShader);
        noiseShader.delete();

        // Scale each noise channel toward the neutral 0.5 by its axis weight:
        // `c' = w*c + (1 - w)*0.5`, so w=1 keeps the full jitter and w=0 pins the
        // channel to 0.5 (zero displacement). Row order is R,G,B,A; last column
        // is the constant offset.
        const axis = resolveEffectAxis(effect.axis);
        if (axis.x !== 1 || axis.y !== 1) {
            // prettier-ignore
            const mask = [
                axis.x, 0, 0, 0, (1 - axis.x) * 0.5,
                0, axis.y, 0, 0, (1 - axis.y) * 0.5,
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
    },
};
