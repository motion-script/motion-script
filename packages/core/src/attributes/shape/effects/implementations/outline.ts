import { lerpNumber } from "@/tween/lerp";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { ModedEffect, EffectData } from "../effect-data";
import { resolveEffectColor, sameEffectColor } from "../effect-data";

/**
 * Where the outline sits relative to the node's silhouette — the same three
 * choices Figma and Illustrator offer for a stroke:
 *
 * - `"outside"` grows outward from the edge, leaving the content untouched.
 * - `"inside"` eats inward, so the node's footprint never changes.
 * - `"center"` straddles the edge, half of `width` on each side.
 */
export type OutlinePosition = "outside" | "center" | "inside";

/**
 * A coloured band traced around the node's silhouette — the alpha outline
 * (a.k.a. "stroke" in Figma) that geometry strokes can't give you when the
 * silhouette comes from text, an image's alpha, or a whole subtree.
 */
export interface OutlineEffect extends ModedEffect {
    type: "outline";
    /** Band thickness in px. 0 = off. */
    width: number;
    /** Band colour — any CSS colour, theme alias, or RGBA tuple. */
    color: Color;
    /** Which side of the silhouette edge the band grows from. */
    position: OutlinePosition;
}

export const outlineEffect: EffectData<OutlineEffect> = {
    lerp: (from, to, t) => ({
        type: "outline",
        width: lerpNumber(from.width, to.width, t),
        color: lerpColor(resolveEffectColor(from.color), resolveEffectColor(to.color), t),
        // position is discrete — snap at the midpoint like other enum-valued fields.
        position: t < 0.5 ? from.position : to.position,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.width === b.width &&
        sameEffectColor(a.color, b.color) &&
        a.position === b.position &&
        a.mode === b.mode,
    // Reads a ring of neighbouring texels to dilate/erode the source's alpha.
    surface: "shader",
};
