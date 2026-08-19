import { AssetNotLoadedError, resolveVideoTimestamp, type VideoFillResolved, type VideoEchoFilter } from "@motion-script/core";
import type { Image as CKImage } from "@motion-script/canvaskit";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { makeImageShader, applyMediaFilters, samplingFor } from "./image";
import { getCanvasKitBlendMode } from "../blend";

/**
 * Shades with the adapter-decoded video frame at the fill's current timestamp
 * and applies the fill's filter chain. Mirrors {@link ImageFillRenderer}; the
 * only difference is the per-timestamp frame lookup. The frame's CKImage is
 * adapter-owned (memoized per src in the adapter's videoCKCache) and released
 * when the playhead advances, so — like the image fill — it must NOT be pushed
 * to `transientImages` (which gets `.delete()`'d after the draw).
 *
 * If the fill carries an `echo` filter, this renderer draws the WHOLE frame
 * stack itself — the current frame plus its trailing past frames, each at a
 * decaying weight and composited with the echo blend — and tells the handler to
 * skip its default pass (so the current frame isn't slammed opaque over the
 * faint trail, which would hide it). This mirrors After Effects' Echo Operator.
 */
export class VideoFillRenderer extends FillRenderer<VideoFillResolved> {
    /** Hard cap on echo taps so a runaway `echoes` can't allocate unbounded textures. */
    private static readonly MAX_ECHOES = 32;

    applyPaint(fill: VideoFillResolved, ctx: FillRendererContext): boolean {
        if (!fill.src) return false;
        // Zero until the clip's decode session has opened, which is the one thing
        // that distinguishes the two ways this can come up empty: a clip nobody
        // declared (an error — the frame would silently lose its footage) from a
        // *timestamp* the decode window hasn't reached yet (not an error; the
        // asset loaded, and `warmPendingVideo` settles the frame).
        const duration = ctx.assets.getVideoDuration(fill.src);
        if (duration === 0) throw new AssetNotLoadedError("video", fill.src);

        // The source time to show. Derived here, from how long the painting node
        // has existed, unless the fill carries an explicit `timestamp` — so a
        // clip plays wherever it is painted without anything advancing it.
        const timestamp = resolveVideoTimestamp(fill, ctx.elapsed, duration);
        // claim, not getVideoFrame: several fills can be showing different times
        // of one clip in this frame, and they must not share its one texture.
        const img = ctx.assets.claimVideoFrame(fill.src, timestamp);
        // Nothing decoded at or before this timestamp yet — the re-render loop
        // will come back for it. See the note on `duration` above.
        if (!img) return false;

        const echo = fill.preset?.adjustments.find(
            (f): f is VideoEchoFilter => f.type === "echo",
        );

        if (echo && echo.echoes > 0 && echo.delay > 0) {
            this.drawEchoStack(fill, ctx, echo, img, timestamp);
            // Handler skips its own draw — we've drawn the full stack. It still
            // clears the shader and frees transientImages afterward.
            ctx.skipDefaultDraw = true;
            return true;
        }

        // No echo: plain single pass, handler draws the figure. The wrapping
        // shader is ours even though the frame beneath it isn't, so it goes to
        // `transientPaintObjects` — freed after the draw, once the paint has let go.
        const base = makeImageShader(img, fill, ctx.canvasKit, ctx.getShapeBounds(), samplingFor(fill));
        ctx.transientPaintObjects.push(base);
        ctx.paint.setShader(applyMediaFilters(fill, ctx, base));
        return true;
    }

    /**
     * Draw the echo frame stack: each past tap at `decay ** n` weight, then the
     * current frame at full weight (tap 0), all composited with the echo blend so
     * the trail stays visible beneath/around the current frame. Past taps are
     * independent, caller-owned textures from the adapter (pushed to
     * `transientImages` for the handler to free); cold/out-of-range taps are
     * skipped, so the trail degrades gracefully and fills in as playback warms.
     *
     * @param current the adapter-owned current-frame image (already fetched)
     * @param timestamp the resolved source time `current` was fetched at — taps
     *                  walk back from it, so it must be the same value
     */
    private drawEchoStack(
        fill: VideoFillResolved,
        ctx: FillRendererContext,
        echo: VideoEchoFilter,
        current: CKImage,
        timestamp: number,
    ): void {
        const { paint, canvasKit } = ctx;
        const decay = echo.decay ?? 0.5;
        const blendMode = getCanvasKitBlendMode(canvasKit, echo.blend ?? "screen");
        // Honour the requested count (decay fades across all of it) but bound the
        // actual draws/textures to MAX_ECHOES.
        const taps = Math.min(Math.max(0, Math.floor(echo.echoes)), VideoFillRenderer.MAX_ECHOES);

        // Base paint alpha the handler would have used (fill opacity × pass-through).
        const baseAlpha = (fill.opacity ?? 1) * ctx.worldAlpha;
        const bounds = ctx.getShapeBounds();

        // Oldest → newest so newer (brighter) taps composite over older ones.
        for (let n = taps; n >= 1; n--) {
            const ts = timestamp - n * echo.delay;
            if (ts < 0) continue;
            const tap = ctx.assets.getVideoFrameImage(fill.src, ts);
            if (!tap) continue; // not warm yet — warmPendingVideo() decodes it for the re-render

            ctx.transientImages.push(tap); // handler frees after the draw
            const tapShader = makeImageShader(tap, fill, canvasKit, bounds);
            ctx.transientPaintObjects.push(tapShader);
            paint.setShader(tapShader);
            paint.setImageFilter(null);
            paint.setAlphaf(baseAlpha * Math.pow(decay, n));
            paint.setBlendMode(blendMode);
            ctx.drawShape(paint);
        }

        // Current frame (tap 0): full weight, the fill's pixel filters applied,
        // composited with the echo blend so it joins the stack rather than hiding
        // the trail behind an opaque pass.
        const base = makeImageShader(current, fill, canvasKit, bounds, samplingFor(fill));
        ctx.transientPaintObjects.push(base);
        paint.setShader(applyMediaFilters(fill, ctx, base));
        paint.setAlphaf(baseAlpha);
        paint.setBlendMode(blendMode);
        ctx.drawShape(paint);

        // Reset paint so later fills/cleanup start clean (handler also resets).
        paint.setShader(null);
        paint.setImageFilter(null);
        paint.setAlphaf(baseAlpha);
        paint.setBlendMode(fill.blend ? getCanvasKitBlendMode(canvasKit, fill.blend) : canvasKit.BlendMode.SrcOver);
    }
}
