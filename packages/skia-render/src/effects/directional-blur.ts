import type { EffectHandler } from "./handler";
import { type DirectionalBlurEffect } from "@motion-script/core";

/**
 * Motion-blur-style directional blur — smears the layer along a single axis.
 *
 * `MakeBlur` only blurs axis-aligned, so the smear `angle` is achieved by
 * rotating the layer to align it with the X axis, blurring anisotropically
 * (sigmaX from `radius`, sigmaY = 0), then rotating back. The two
 * `MakeMatrixTransform` rotations are exact inverses, so geometry is
 * unaffected — only the blur kernel ends up rotated.
 */
export const directionalBlurEffectHandler: EffectHandler<DirectionalBlurEffect> = {
    type: "directionalBlur",

    makeImageFilter(effect, ck) {
        if (effect.radius <= 0) return null;

        // Skia's blur sigma is roughly half the perceived "radius" of the blur.
        const sigma = effect.radius / 2;
        const rad = (effect.angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const linear = { filter: ck.FilterMode.Linear };

        // Rotate by -angle so the smear axis lands on X.
        const rotateForward = ck.ImageFilter.MakeMatrixTransform(
            [cos, sin, 0, -sin, cos, 0, 0, 0, 1],
            linear,
            null,
        );

        const blur = ck.ImageFilter.MakeBlur(sigma, 0, ck.TileMode.Decal, rotateForward);
        rotateForward.delete();

        // Rotate back by +angle (inverse of the forward rotation).
        const rotateBack = ck.ImageFilter.MakeMatrixTransform(
            [cos, -sin, 0, sin, cos, 0, 0, 0, 1],
            linear,
            blur,
        );
        blur.delete();

        return rotateBack;
    },
};
