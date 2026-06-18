import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

/**
 * Which channel(s) / colour space component the invert is applied to.
 *
 * - `'red' | 'green' | 'blue'`  — invert a single RGB channel.
 * - `'rgba'`                    — invert red, green and blue (alpha untouched).
 * - `'alpha'`                   — invert the alpha channel.
 * - `'hue'`                     — rotate hue by 180°.
 * - `'luminance'`               — invert perceptual luminance (BT.709) while preserving chroma.
 */
export type InvertChannel =
    | "red"
    | "green"
    | "blue"
    | "rgba"
    | "alpha"
    | "hue"
    | "luminance";

export interface InvertEffect extends BackdropCapable {
    type: "invert";
    /** Which channel(s) / colour component to invert. */
    channel: InvertChannel;
    /** 0–1: blend from original (0) to fully inverted on `channel` (1). */
    strength: number;
}

export const invertEffect: EffectData<InvertEffect> = {
    lerp: (from, to, t) => ({
        type: "invert",
        channel: t < 0.5 ? from.channel : to.channel,
        strength: lerpNumber(from.strength, to.strength, t),
        backdrop: t < 0.5 ? from.backdrop : to.backdrop,
    }),
    equals: (a, b) => a.channel === b.channel && a.strength === b.strength && a.backdrop === b.backdrop,
};
