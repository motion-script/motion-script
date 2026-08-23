



import { FontStyle } from "@/attributes/text/span";
import { TextState } from "@/render/descriptors/text";
import { TextBlockLayout } from "@/render/text-layout";

/**
 * Provides text-measurement primitives to any context that needs to know how
 * wide a run of text will be before actually drawing it (e.g. for layout
 * calculations, line-breaking, or positioning).
 *
 * `RenderContext2D` implements this interface so nodes can measure text through
 * the same object they use to draw — no separate measurement pass needed.
 */
export abstract class Measurer {
    /**
     * Returns the advance width (in pixels) of `text` rendered at the given
     * `fontSize` with the specified font properties.
     *
     * @param text          The string to measure.
     * @param fontSize      Size in pixels.
     * @param fontFamily    CSS-style family name (e.g. `"Inter"`).
     * @param fontWeight    Numeric weight (100–900). Defaults to 400 when omitted.
     * @param letterSpacing Extra inter-glyph spacing in pixels. Defaults to 0.
     * @param fontStyle     Italic / oblique variant. Defaults to normal.
     * @returns Advance width in pixels.
     */
    abstract measureText(
        text: string,
        fontSize: number,
        fontFamily: string,
        fontWeight?: number,
        letterSpacing?: number,
        fontStyle?: FontStyle,
    ): number;

    /**
     * Lay `state` out the way it would be drawn and report where every character
     * landed — see {@link TextBlockLayout} for the space and the caret model.
     *
     * This is what makes on-canvas text editing possible: glyph positions live
     * in the backend's shaper, so a host drawing its own caret and selection has
     * no way to compute them, and anything it approximates in the DOM disagrees
     * with the render as soon as the font, the line height or the wrapping does.
     *
     * Takes the whole {@link TextState} rather than a handful of font fields
     * because the resolution a caret has to agree with lives in the backend:
     * `'autofit'` picks a size from the box, `wrap` turns the width into a wrap
     * limit, and `textAlign` places the lines within it. Handing over the same
     * descriptor that gets drawn is what keeps the two from drifting apart.
     *
     * Returns `null` when the backend can't measure this — the default, so a
     * backend that never needed glyph positions keeps working, and for cases no
     * caret model fits: text-on-path (glyphs follow a curve, not a line box) and
     * a block with active selection segments.
     */
    layoutTextBlock(state: Partial<TextState>): TextBlockLayout | null {
        void state;
        return null;
    }
}
