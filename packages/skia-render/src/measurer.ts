import { FontStyle, type Measurer2D, type Size2D, type TextBlockLayout, type TextBlockSource, type TextState } from "@motion-script/core";
import type { SkiaTextAssets } from "./assets";
import { measureTextCached } from "./shapes/paragraph-cache";
import { textBlockLayout } from "./shapes/text";

/**
 * {@link Measurer2D} implementation used by layout (auto/hug sizing) to
 * measure text width before drawing — routes through the same paragraph
 * layout path as rendering so the measured width matches the drawn width
 * exactly, including letter-spacing and font-matching behavior.
 *
 * Takes only the text slice of the adapter: measuring needs the font manager, the
 * paragraph cache and the font epoch, and nothing else.
 */
export class SkiaMeasurer implements Measurer2D, TextBlockSource {
    private storageAdapter: SkiaTextAssets & { getCanvasKit(): import("@motion-script/canvaskit").CanvasKit };

    constructor(storageAdapter: SkiaTextAssets & { getCanvasKit(): import("@motion-script/canvaskit").CanvasKit }) {
        this.storageAdapter = storageAdapter;
    }

    measureText(text: string, fontSize: number, fontFamily: string, fontWeight: number = 400, letterSpacing: number = 0, fontStyle: FontStyle = 'normal'): Size2D {
        // Measure through the same (cached) paragraph layout used to render, so
        // hug/auto sizing matches the drawn size exactly (incl. letter spacing).
        return measureTextCached(
            this.storageAdapter.getCanvasKit(),
            this.storageAdapter.getFontMgr(),
            this.storageAdapter.getParagraphCache(),
            this.storageAdapter.getFontEpoch(),
            text, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle,
        );
    }

    layoutTextBlock(state: Partial<TextState>): TextBlockLayout | null {
        // Same shaping path as the draw, so a caret drawn from these slots sits
        // on the glyph rather than beside it.
        return textBlockLayout(
            this.storageAdapter.getCanvasKit(),
            this.storageAdapter.getFontMgr(),
            state,
        );
    }
}
