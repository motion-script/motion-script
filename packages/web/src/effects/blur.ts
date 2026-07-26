import { type BlurEffect, type BlurFilter } from "@motion-script/core";
import type { EffectHandler } from "./handler";

/**
 * Gaussian blur. Serves both the scene effect and the image/video-fill filter —
 * since the field unification both are `{ type: 'blur', radius }` and both want
 * Decal tiling, so a second copy would only be a second place to fix bugs.
 */
export const blurEffectHandler: EffectHandler<BlurEffect | BlurFilter> = {
    type: "blur",

    makeImageFilter(effect, ck) {
        // Skia's blur sigma is roughly half the perceived "radius" of the blur.
        const sigma = effect.radius / 2;
        return ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null);
    },
};
