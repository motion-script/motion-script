import { AssetCatalog, type AssetManifest, type GlobalLayerConfig, type Scene, type Size2D } from "@motion-script/core";
import {
    renderFrameAt,
    type FrameSpec,
    type ImageEncoder,
    type ScreenshotFormat,
} from "@motion-script/skia-render/export";
import { WebRenderContext } from "./render-context";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKit } from "./getter";

export type { ScreenshotFormat, FrameSpec };

const EMPTY_MANIFEST: AssetManifest = {
    image: {},
    video: {},
    audio: {},
    font: {},
};

export type ScreenshotParams = {
    scenes: Scene[];
    viewport?: Size2D;
    fps?: number;
    scale?: number;
    manifest?: AssetManifest;
    /** Project-level nodes drawn over every scene (`ProjectConfig.overlays`). */
    overlays?: GlobalLayerConfig[];
    /** Project-level nodes drawn under every scene (`ProjectConfig.backgrounds`). */
    backgrounds?: GlobalLayerConfig[];
    wasmUrl?: string;
    /** Which frame to capture (see {@link FrameSpec}). */
    frame: FrameSpec;
    /** Encoding format (default "png"). */
    format?: ScreenshotFormat;
    /** JPEG quality in [0,1] (ignored for png; default 0.92). */
    quality?: number;
};

export type ScreenshotResult = {
    /** The actual global frame that was captured (after clamping/resolution). */
    frame: number;
    /** Total frames in the timeline, so callers can validate / report. */
    totalFrames: number;
    /** Encoded image bytes. */
    bytes: Uint8Array;
};

/**
 * Browser implementation of the image-encoder seam.
 *
 * This CanvasKit build ships no wasm image encoders, so a snapshot is encoded
 * through a 2D canvas. `toDataURL` is the only encode path a browser offers
 * synchronously, hence the base64 round-trip back to bytes.
 */
class CanvasImageEncoder implements ImageEncoder {
    encode(
        pixels: Uint8Array,
        width: number,
        height: number,
        format: ScreenshotFormat,
        quality?: number,
    ): Uint8Array {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Screenshot encode: could not get a 2d context.");
        // `pixels` is unpremultiplied RGBA8888, which is exactly ImageData's layout.
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);

        const mime = format === "jpeg" ? "image/jpeg" : "image/png";
        const dataUrl = canvas.toDataURL(mime, quality);
        const comma = dataUrl.indexOf(",");
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}

/**
 * Renders a single frame of `scenes` to an image.
 *
 * The frame resolution, precomp and warm-and-re-render retry all live in
 * `@motion-script/skia-render`'s `renderFrameAt`, shared with the video path — so
 * a screenshot is the same render the export would produce at that frame. This
 * function supplies the browser half: a canvas to draw into and a 2D-canvas
 * encoder.
 */
export async function exportScreenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const {
        scenes,
        viewport = { width: 1920, height: 1080 },
        fps = 60,
        scale = 1,
        manifest = EMPTY_MANIFEST,
        overlays,
        backgrounds,
        wasmUrl,
        frame,
        format = "png",
        quality = 0.92,
    } = params;

    if (scenes.length === 0) throw new Error("No scenes to screenshot.");

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = viewport.width * scale;
    offscreenCanvas.height = viewport.height * scale;
    offscreenCanvas.style.display = "none";
    document.body.appendChild(offscreenCanvas);

    const canvasKit = await getCanvasKit(wasmUrl);
    const assetCatalog = new AssetCatalog(manifest);
    const storageAdapter = new WebStorageAdapter(canvasKit, assetCatalog, viewport, fps);
    const renderContext = new WebRenderContext(canvasKit, storageAdapter);
    renderContext.mount(offscreenCanvas);

    try {
        return await renderFrameAt({
            scenes, viewport, fps, scale, manifest, overlays, backgrounds,
            renderContext, storageAdapter, assetCatalog,
            frame, format, quality,
            encoder: new CanvasImageEncoder(),
        });
    } finally {
        renderContext.dispose();
        document.body.removeChild(offscreenCanvas);
    }
}
