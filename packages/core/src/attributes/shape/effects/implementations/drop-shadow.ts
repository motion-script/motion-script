import { lerpNumber } from "@/tween/lerp";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { ModedEffect, EffectData } from "../effect-data";
import { resolveEffectColor, sameEffectColor } from "../effect-data";

/**
 * A shadow cast from the node's **alpha silhouette** rather than from its
 * geometry — the drop shadow that a `shadow` prop can't give you when the shape
 * on screen isn't the shape of the path.
 *
 * `ShapeNode.shadow` fills the node's own outline with the shadow colour and
 * blurs it, which is exactly right for a rect, an ellipse or a star. It is
 * exactly wrong for anything whose visible form comes from *pixels*: a cut-out
 * PNG, a video with an alpha channel, a line of text, a whole subtree. All of
 * those cast a blurred **rectangle**, because the rectangle is what their path
 * is — and on a cut-out subject that reads as a bug rather than as a shadow.
 *
 * So this one is computed from what the node actually drew. Same relationship
 * to `shadow` that {@link OutlineEffect} has to `stroke`: the geometry version
 * is cheaper and sharper where the path *is* the picture, and this one is the
 * answer everywhere else.
 *
 * Offsets are in the scene's own axes — a positive `y` lifts the shadow upward,
 * matching `ShadowProp.offset` rather than the y-down device space the shader
 * runs in, so the two kinds of shadow move the same way under the same numbers.
 */
export interface DropShadowEffect extends ModedEffect {
    type: "dropShadow";
    /** How far the shadow is displaced, in px. */
    offsetX: number;
    offsetY: number;
    /** Softness in px, on the same scale a `blur` effect's radius uses. 0 = hard. */
    blur: number;
    /**
     * Grows (or, negative, shrinks) the silhouette before blurring, in px —
     * `box-shadow`'s third length and Figma's "spread".
     */
    spread: number;
    /** Shadow colour — any CSS colour, theme alias, or RGBA tuple. */
    color: Color;
}

export const dropShadowEffect: EffectData<DropShadowEffect> = {
    lerp: (from, to, t) => ({
        type: "dropShadow",
        offsetX: lerpNumber(from.offsetX, to.offsetX, t),
        offsetY: lerpNumber(from.offsetY, to.offsetY, t),
        blur: lerpNumber(from.blur, to.blur, t),
        spread: lerpNumber(from.spread, to.spread, t),
        color: lerpColor(resolveEffectColor(from.color), resolveEffectColor(to.color), t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.offsetX === b.offsetX &&
        a.offsetY === b.offsetY &&
        a.blur === b.blur &&
        a.spread === b.spread &&
        sameEffectColor(a.color, b.color) &&
        a.mode === b.mode,
    /**
     * A shader rather than Skia's own `MakeDropShadow`, and the reason is the
     * same one {@link outlineEffect} gives for not using `MakeDilate`: the
     * ImageFilter path's layer is bounded to the node rect (see `transform()` in
     * the render context, which sets that bound deliberately so scaling filters
     * can't overrun the clip). A shadow's whole job is to fall *outside* the
     * node, so on that path an offset one would be sliced off at the edge of the
     * box. A shader scope has no such bound.
     */
    surface: "shader",
};
