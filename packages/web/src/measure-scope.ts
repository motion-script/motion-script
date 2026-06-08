import { FontStyle, MeasureScope } from "@motion-script/core";
import { WebStorageAdapter } from "./storage-adapter";
import { layoutParagraph } from "./shapes/paragraph-layout";

/**
 * {@link MeasureScope} implementation used by layout (auto/hug sizing) to
 * measure text width before drawing — routes through the same paragraph
 * layout path as rendering so the measured width matches the drawn width
 * exactly, including letter-spacing and font-matching behavior.
 */
export class WebMeasureScope extends MeasureScope {
    private storageAdapter: WebStorageAdapter;

    constructor(storageAdapter: WebStorageAdapter) {
        super();
        this.storageAdapter = storageAdapter;
    }

    measureText(text: string, fontSize: number, fontFamily: string, fontWeight: number = 400, letterSpacing: number = 0, fontStyle: FontStyle = 'normal'): number {
        if (text.length === 0) return 0;
        const ck = this.storageAdapter.getCanvasKit();
        const fontMgr = this.storageAdapter.getFontMgr();
        // Measure through the same paragraph layout used to render, so hug/auto
        // sizing matches the drawn width exactly (incl. letter spacing semantics).
        const layout = layoutParagraph(
            ck,
            fontMgr,
            [{ text, fontFamily, fontSize, fontWeight, letterSpacing, fontStyle }],
            { align: 'center', lineHeight: 1, maxWidth: Infinity, originX: 0, originY: 0 },
        );
        const w = layout.width;
        for (const f of layout.fonts) f.delete();
        return w;
    }
}
