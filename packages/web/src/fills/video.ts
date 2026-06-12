import type { VideoFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { makeImageShader, applyMediaFilters } from "./image";

/**
 * Shades with the adapter-decoded video frame at the fill's current timestamp
 * and applies the fill's filter chain. Mirrors {@link ImageFillRenderer}; the
 * only difference is the per-timestamp frame lookup. The frame's CKImage is
 * adapter-owned (memoized per src in the adapter's videoCKCache) and released
 * when the playhead advances, so — like the image fill — it must NOT be pushed
 * to `transientImages` (which gets `.delete()`'d after the draw).
 */
export class VideoFillRenderer extends FillRenderer<VideoFillResolved> {
    applyPaint(fill: VideoFillResolved, ctx: FillRendererContext): boolean {
        if (!fill.src) return false;
        const img = ctx.assets.getVideoFrame(fill.src, fill.timestamp);
        if (!img) return false;
        ctx.paint.setShader(makeImageShader(img, fill, ctx.canvasKit, ctx.getShapeBounds()));
        applyMediaFilters(fill, ctx);
        return true;
    }
}
