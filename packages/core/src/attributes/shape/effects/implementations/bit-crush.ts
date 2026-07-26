import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * A fixed hardware palette to snap colours to.
 *
 * - `'none'` — no palette; quantize each channel to `bits` instead.
 * - `'gameboy'` — the DMG's four greens.
 * - `'cga'` — IBM CGA palette 1 high-intensity (black, cyan, magenta, white).
 * - `'nes'` — a representative 16-colour cut of the NES master palette.
 */
export type BitCrushPalette = "none" | "gameboy" | "cga" | "nes";

/**
 * Colour-depth reduction: either quantize each channel to `bits`, or snap every
 * pixel to its nearest entry in a fixed hardware palette.
 *
 * The distinction from `posterize` and `dither` is *which* colours survive.
 * Posterize keeps an evenly-spaced grid per channel; this can instead force an
 * arbitrary, uneven, historically-specific set — which is what actually makes
 * something look like a Game Boy rather than merely low-colour.
 *
 * Pairs naturally with `dither`: quantize here, and let an ordered dither carry
 * the error so gradients survive the palette cut.
 */
export interface BitCrushEffect extends ModedEffect {
    type: "bitCrush";
    /** Bits per channel when `palette` is `'none'` (1–8). */
    bits: number;
    /** Fixed palette to snap to, or `'none'` to use `bits`. */
    palette: BitCrushPalette;
    /** 0–1 blend between the original colour and the crushed one. */
    amount: number;
}

export const bitCrushEffect: EffectData<BitCrushEffect> = {
    lerp: (from, to, t) => ({
        type: "bitCrush",
        bits: lerpNumber(from.bits, to.bits, t),
        // A halfway palette is meaningless — snap, and let `amount` carry the fade.
        palette: t < 0.5 ? from.palette : to.palette,
        amount: lerpNumber(from.amount, to.amount, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.bits === b.bits &&
        a.palette === b.palette &&
        a.amount === b.amount &&
        a.mode === b.mode,
    // A palette search is per-pixel non-linear; no LUT colour filter in this build.
    surface: "shader",
};
