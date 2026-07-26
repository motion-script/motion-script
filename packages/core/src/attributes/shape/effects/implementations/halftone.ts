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
 * Halftone screen — the newsprint / comic-book look. The image is divided into a
 * rotated grid of cells and each cell's tone becomes the size of a mark, so
 * continuous shading is reproduced by varying dot area rather than intensity.
 *
 * `colored` switches from one black screen over luminance to three screens (one
 * per channel) at the classic offset-printing angles, which produces the
 * rosette pattern and the CMY fringing of real four-colour process work.
 */
export interface HalftoneEffect extends ModedEffect {
    type: "halftone";
    /** Cell pitch in px — the distance between dot centres. */
    size: number;
    /** Screen rotation in degrees; 45° is the traditional dot angle. */
    angle: number;
    /** Mark drawn in each cell. */
    shape: HalftoneShape;
    /** Screen each RGB channel separately at offset angles instead of luminance only. */
    colored: boolean;
}

export const halftoneEffect: EffectData<HalftoneEffect> = {
    lerp: (from, to, t) => ({
        type: "halftone",
        size: lerpNumber(from.size, to.size, t),
        angle: lerpNumber(from.angle, to.angle, t),
        shape: t < 0.5 ? from.shape : to.shape,
        colored: t < 0.5 ? from.colored : to.colored,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.size === b.size &&
        a.angle === b.angle &&
        a.shape === b.shape &&
        a.colored === b.colored &&
        a.mode === b.mode,
    // Cell position drives the mark, so it needs each pixel's coordinates.
    surface: "shader",
};
