import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type DirectionalBlurEffect } from "@motion-script/core";

/**
 * Motion-blur-style directional blur — smears the layer along a single axis.
 *
 * `MakeBlur` only blurs axis-aligned, so the smear `direction` is achieved by
 * rotating the layer to align it with the X axis, blurring anisotropically
 * (sigmaX from `blurLength`, sigmaY = 0), then rotating back. The two
 * `MakeMatrixTransform` rotations are exact inverses, so geometry is
 * unaffected — only the blur kernel ends up rotated.
 */
export class DirectionalBlurCanvasKitEffect extends CanvasKitEffect<DirectionalBlurEffect> {
    constructor() {
        super("directionalBlur");
    }

    makeImageFilter(effect: DirectionalBlurEffect, ck: CanvasKit): any {
        if (effect.blurLength <= 0) return null;

        // Skia's blur sigma is roughly half the perceived "radius" of the blur.
        const sigma = effect.blurLength / 2;
        const rad = (effect.direction * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const linear = { filter: ck.FilterMode.Linear };

        // Rotate by -direction so the smear axis lands on X.
        const rotateForward = ck.ImageFilter.MakeMatrixTransform(
            [cos, sin, 0, -sin, cos, 0, 0, 0, 1],
            linear,
            null,
        );

        const blur = ck.ImageFilter.MakeBlur(sigma, 0, ck.TileMode.Decal, rotateForward);
        rotateForward.delete();

        // Rotate back by +direction (inverse of the forward rotation).
        const rotateBack = ck.ImageFilter.MakeMatrixTransform(
            [cos, -sin, 0, sin, cos, 0, 0, 0, 1],
            linear,
            blur,
        );
        blur.delete();

        return rotateBack;
    }
}
