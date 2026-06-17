import { FontStyle, MeasureScope } from "@motion-script/core";
import { WebStorageAdapter } from "./storage-adapter";
import { measureTextCached } from "./shapes/paragraph-cache";

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
        // Measure through the same (cached) paragraph layout used to render, so
        // hug/auto sizing matches the drawn width exactly (incl. letter spacing).
        return measureTextCached(
            this.storageAdapter.getCanvasKit(),
            this.storageAdapter.getFontMgr(),
            this.storageAdapter.getParagraphCache(),
            this.storageAdapter.getFontEpoch(),
            text, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle,
        );
    }
}
