



import { FontStyle } from "@/attributes/text/span";

/**
 * Provides text-measurement primitives to any context that needs to know how
 * wide a run of text will be before actually drawing it (e.g. for layout
 * calculations, line-breaking, or positioning).
 *
 * `RenderContext` implements this interface so nodes can measure text through
 * the same object they use to draw — no separate measurement pass needed.
 */
export abstract class MeasureScope {
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
}
