import { lerpNumber } from "@/tween/lerp";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { ModedEffect, EffectData } from "../effect-data";
import { resolveEffectColor, sameEffectColor } from "../effect-data";

/**
 * Built-in glyph ramps, each ordered **least ink first**: `charset[0]` stands in
 * for the darkest cells and the last entry for the lightest.
 *
 * That ordering is about the *result*, not the glyph. On the default white ink
 * over black, an empty cell is the darkest thing the effect can draw and a solid
 * one the brightest, so least-ink-first is exactly dark-to-light. Invert the ink
 * and background — black on white, the paper look — and the same ramp is used
 * back to front automatically, so a custom ramp only ever has to be written once.
 *
 * - `'standard'` — the classic ten-step ASCII ramp.
 * - `'blocks'` — Unicode shading blocks; the most legible at small cell sizes,
 *   because each step really is a fixed fraction of coverage.
 * - `'braille'` — braille dot patterns, the finest ramp of the set.
 * - `'binary'` — just `0` and `1`: a two-tone cut rather than a ramp.
 * - `'hex'` — `0`–`F`, the hex-dump look. Its "ramp" is nominal, since a glyph's
 *   ink doesn't track its digit, so expect texture rather than tone.
 */
export type AsciiCharset = "standard" | "blocks" | "braille" | "binary" | "hex";

/** The ramp each named charset expands to. Exported so a backend needn't guess. */
export const ASCII_CHARSETS: Record<AsciiCharset, string> = {
    standard: " .:-=+*#%@",
    blocks: " ░▒▓█",
    braille: " ⠄⣀⣄⣤⣶⣷⣿",
    binary: "01",
    hex: "0123456789ABCDEF",
};

/** Resolve a charset option to its literal ramp; unknown names fall back to `'standard'`. */
export function resolveAsciiCharset(charset: AsciiCharset | string): string {
    return ASCII_CHARSETS[charset as AsciiCharset] ?? charset;
}

/**
 * ASCII art: the content is divided into a grid of cells, each cell's tone is
 * matched to a glyph, and that glyph is drawn in its place.
 *
 * The glyphs come from a texture baked once per charset/font/size — the first
 * effect to use the renderer's resource hook.
 */
export interface AsciiEffect extends ModedEffect {
    type: "ascii";
    /** Cell size in px — the width of one character. */
    size: number;
    /** A named ramp, or a custom string ordered least-ink-first. */
    charset: AsciiCharset | string;
    /** Family the glyphs are baked in. Best results from a monospace face. */
    fontFamily: string;
    /** Colour of the glyphs when `colored` is false. */
    ink: Color;
    /** Colour behind the glyphs. Fully transparent leaves the backdrop showing. */
    background: Color;
    /** Tint each glyph with its own cell's colour instead of using `ink`. */
    colored: boolean;
}

export const asciiEffect: EffectData<AsciiEffect> = {
    lerp: (from, to, t) => ({
        type: "ascii",
        size: lerpNumber(from.size, to.size, t),
        // A charset, a family and the colour mode are all discrete — snap.
        charset: t < 0.5 ? from.charset : to.charset,
        fontFamily: t < 0.5 ? from.fontFamily : to.fontFamily,
        ink: lerpColor(resolveEffectColor(from.ink), resolveEffectColor(to.ink), t),
        background: lerpColor(resolveEffectColor(from.background), resolveEffectColor(to.background), t),
        colored: t < 0.5 ? from.colored : to.colored,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.size === b.size &&
        a.charset === b.charset &&
        a.fontFamily === b.fontFamily &&
        sameEffectColor(a.ink, b.ink) &&
        sameEffectColor(a.background, b.background) &&
        a.colored === b.colored &&
        a.mode === b.mode,
    // Reads one texel per cell and a glyph texture alongside it.
    surface: "shader",
};
