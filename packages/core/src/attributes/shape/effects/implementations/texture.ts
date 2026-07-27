import { lerpNumber } from "@/tween/lerp";
import type { BlendMode } from "../../fill/blend";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Overlay an image onto the content, blended.
 *
 * The ingredient every material look is missing: paper grain for a print,
 * canvas weave for a painting, fabric for a textile. The image is yours — put it
 * in the project's `public/` folder and name it the way an image fill would.
 *
 * `multiply` (the default) is the right blend for most of them, because that is
 * what a texture physically does: it *removes* light where the surface is rough,
 * and leaves it where the surface is smooth.
 */
export interface TextureEffect extends ModedEffect {
    type: "texture";
    /** Image path, resolved like an image fill's `src`. */
    src: string;
    /** 0–1 blend strength. 0 = off. */
    amount: number;
    /** How the texture composites onto the content. */
    blend: BlendMode;
    /** Texture scale — 1 covers the node once, 2 tiles it at half size. */
    scale: number;
    /** Rotation in degrees. */
    angle: number;
}

export const textureEffect: EffectData<TextureEffect> = {
    lerp: (from, to, t) => ({
        type: "texture",
        // The image and the blend are discrete — snap rather than cross-fade,
        // which would need two textures bound at once.
        src: t < 0.5 ? from.src : to.src,
        blend: t < 0.5 ? from.blend : to.blend,
        amount: lerpNumber(from.amount, to.amount, t),
        scale: lerpNumber(from.scale, to.scale, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.src === b.src &&
        a.amount === b.amount &&
        a.blend === b.blend &&
        a.scale === b.scale &&
        a.angle === b.angle &&
        a.mode === b.mode,
    surface: "shader",
    // Without this the image is never requested, the backend's synchronous
    // lookup finds nothing, and the effect silently has no texture to draw.
    prepare: (effect, tracker, width, height) => {
        if (effect.src) tracker.requestImage(effect.src, width, height);
    },
};
