import { FontStyle } from "@/attributes/text/span";
import type { Size2D } from "@/attributes/layout/size";

/**
 * Text measurement, as a node sees it.
 *
 * The one thing layout cannot do for itself: how wide a run of text comes out
 * is a property of the shaper, which lives in the backend. Every `measure` and
 * `layout` pass is threaded one of these so a node can ask before it draws —
 * `RenderContext2D` implements it, so a node measures through the same object
 * it paints with and there is no separate measurement pass.
 *
 * **An interface, and deliberately this small.** A node needs exactly one
 * question answered here. Glyph *positions* — what an on-canvas caret needs —
 * are a different question with a different audience (an editor, not a node),
 * so they live on {@link RenderContext2D.layoutTextBlock} instead. Keeping them
 * apart is what lets a host supply a measurer without also having to be a
 * renderer.
 */
export interface Measurer2D {
    /**
     * The size, in pixels, of `text` shaped at `fontSize` in the given face:
     * its advance width and the height of the line box the shaper produced.
     *
     * **Both dimensions, because the shaper already knows both.** It used to
     * return the width alone, which left every caller that needed a height to
     * reconstruct one from `fontSize × lineHeight` — an approximation that
     * disagrees with the shaper the moment a fallback face, a different
     * ascent/descent or a script with taller glyphs is involved. Handing back
     * what was measured costs nothing and cannot drift.
     *
     * `text` is measured as a single unwrapped run: no `maxWidth`, no alignment.
     * A block's real layout — where lines break, where each caret sits — is
     * `RenderContext2D.layoutTextBlock`.
     *
     * @param text          The string to measure.
     * @param fontSize      Size in pixels.
     * @param fontFamily    CSS-style family name (e.g. `"Inter"`).
     * @param fontWeight    Numeric weight (100–900). Defaults to 400 when omitted.
     * @param letterSpacing Extra inter-glyph spacing in pixels. Defaults to 0.
     * @param fontStyle     Italic / oblique variant. Defaults to normal.
     */
    measureText(
        text: string,
        fontSize: number,
        fontFamily: string,
        fontWeight?: number,
        letterSpacing?: number,
        fontStyle?: FontStyle,
    ): Size2D;
}
