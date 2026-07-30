import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, type Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Which part of the map drives the displacement.
 *
 * - `"rg"` — red moves pixels horizontally, green vertically. The convention
 *   every normal/flow map is authored to, and the only one that can push in two
 *   directions independently.
 * - `"luminance"` — one value drives both axes. What a grayscale *bump* map
 *   means: the brighter the pixel, the further it is pushed along `amount`.
 * - `"alpha"` — the map's alpha, for displacing from a cut-out shape.
 */
export type DisplaceChannel = "rg" | "luminance" | "alpha";

/**
 * Displacement map — the content is resampled at a position pushed around by a
 * second image, rather than having its colours changed.
 *
 * This is the general warp. `wave` and `twirl` are the two procedural cases
 * worth spelling out; everything else — refraction, heat haze, water, cloth,
 * dissolve — is this effect plus the right map. Point it at a normal map for
 * glass, at a noise texture for haze, at a gradient for a directional smear.
 *
 * **In `mode: 'backdrop'` this is refraction.** The displacement runs on what is
 * painted *beneath* the node and is clipped to the node's silhouette, so the
 * scene bends as it passes through the shape while the shape's own edges stay
 * sharp — the frosted/liquid-glass panel, from one effect.
 *
 * `midpoint` is what the map calls "no displacement". Signed data packed into
 * unsigned bytes centres on 0.5 (the default, and what a normal map assumes); a
 * mask-style map that should only ever push one way wants 0.
 */
export interface DisplaceEffect extends ModedEffect {
    type: "displace";
    /** Map image path, resolved like an image fill's `src`. */
    src: string;
    /** Displacement at full deflection, in px per axis. `{x: 0, y: n}` warps vertically only. */
    amount: Vector2;
    /** Which channels of the map are read. */
    channel: DisplaceChannel;
    /** The map value meaning "don't move" — 0.5 for signed data, 0 for a one-way mask. */
    midpoint: number;
    /** Map scale — 1 covers the node once, 2 tiles it at half size. */
    scale: number;
    /** Map rotation in degrees. */
    angle: number;
}

export const displaceEffect: EffectData<DisplaceEffect> = {
    lerp: (from, to, t) => ({
        type: "displace",
        // The image is discrete — snap rather than cross-fade, which would need
        // two maps bound at once (same reasoning as `texture`).
        src: t < 0.5 ? from.src : to.src,
        channel: t < 0.5 ? from.channel : to.channel,
        amount: lerpVector2(from.amount, to.amount, t),
        midpoint: lerpNumber(from.midpoint, to.midpoint, t),
        scale: lerpNumber(from.scale, to.scale, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.src === b.src &&
        a.amount.x === b.amount.x &&
        a.amount.y === b.amount.y &&
        a.channel === b.channel &&
        a.midpoint === b.midpoint &&
        a.scale === b.scale &&
        a.angle === b.angle &&
        a.mode === b.mode,
    // Resamples the source at a displaced position.
    surface: "shader",
    // Without this the map is never requested, the backend's synchronous lookup
    // finds nothing, and the effect silently has nothing to displace by.
    prepare: (effect, tracker, width, height) => {
        if (effect.src) tracker.requestImage(effect.src, width, height);
    },
};
