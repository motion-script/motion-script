import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * CRT scanlines — periodic dark bands across the content.
 *
 * `offset` scrolls the band pattern; animating it past `spacing` produces the
 * slow vertical roll of a mistuned display, and it wraps, so a linear tween of
 * `offset` loops seamlessly.
 */
export interface ScanlinesEffect extends ModedEffect {
    type: "scanlines";
    /** Distance between band centres, in px. */
    spacing: number;
    /** 0–1 share of each period the dark band covers. */
    thickness: number;
    /** 0–1 how far the bands darken. 0 = off. */
    darkness: number;
    /** Band offset in px — animate it to roll the pattern. */
    offset: number;
    /** Band angle in degrees. 0 = horizontal bands. */
    angle: number;
}

export const scanlinesEffect: EffectData<ScanlinesEffect> = {
    lerp: (from, to, t) => ({
        type: "scanlines",
        spacing: lerpNumber(from.spacing, to.spacing, t),
        thickness: lerpNumber(from.thickness, to.thickness, t),
        darkness: lerpNumber(from.darkness, to.darkness, t),
        offset: lerpNumber(from.offset, to.offset, t),
        angle: lerpNumber(from.angle, to.angle, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.spacing === b.spacing &&
        a.thickness === b.thickness &&
        a.darkness === b.darkness &&
        a.offset === b.offset &&
        a.angle === b.angle &&
        a.mode === b.mode,
    // The band a pixel falls in depends on its position.
    surface: "shader",
};
