import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * The screen pattern each halftone cell is drawn with.
 *
 * - `"dot"` — the classic circular dot that grows with tone.
 * - `"line"` — a line screen: parallel rules that thicken with tone.
 * - `"cross"` — crossed rules, a coarse engraving / crosshatch.
 */
export type HalftoneShape = "dot" | "line" | "cross";

/**
 * How many plates the screen is separated into.
 *
 * - `"mono"` — one black screen over luminance. The newsprint look.
 * - `"cmyk"` — four plates at the classic process angles (C 15°, M 75°, Y 0°,
 *   K 45°). Pulling the shared darkness onto a K plate is what keeps neutrals
 *   neutral, so this is the one that reads as *printed*.
 * - `"rgb"` — one screen per RGB channel. Cheaper and occasionally the look you
 *   want, but with no K plate every grey prints three overlapping mid-dots, so
 *   anything neutral turns to colour noise. Prefer `"cmyk"` for print looks.
 */
export type HalftoneSeparation = "mono" | "rgb" | "cmyk";

/**
 * Halftone screen — the newsprint / comic-book look. The image is divided into a
 * rotated grid of cells and each cell's tone becomes the size of a mark, so
 * continuous shading is reproduced by varying dot area rather than intensity.
 *
 * `separation` picks how many plates the image is split across — see
 * {@link HalftoneSeparation}.
 */
export interface HalftoneEffect extends ModedEffect {
    type: "halftone";
    /** Cell pitch in px — the distance between dot centres. */
    size: number;
    /** Screen rotation in degrees; 45° is the traditional dot angle. */
    angle: number;
    /** Mark drawn in each cell. */
    shape: HalftoneShape;
    /** How many plates to screen into. */
    separation: HalftoneSeparation;
}

export const halftoneEffect: EffectData<HalftoneEffect> = {
    lerp: (from, to, t) => ({
        type: "halftone",
        size: lerpNumber(from.size, to.size, t),
        angle: lerpNumber(from.angle, to.angle, t),
        shape: t < 0.5 ? from.shape : to.shape,
        separation: t < 0.5 ? from.separation : to.separation,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.size === b.size &&
        a.angle === b.angle &&
        a.shape === b.shape &&
        a.separation === b.separation &&
        a.mode === b.mode,
    // Cell position drives the mark, so it needs each pixel's coordinates.
    surface: "shader",
};
