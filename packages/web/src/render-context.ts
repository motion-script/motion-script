import type { CanvasKit } from "@motion-script/canvaskit";
import { SkiaRenderContext } from "@motion-script/skia-render/render-context";
import type { WebStorageAdapter } from "./storage-adapter";

/**
 * Browser bindings for {@link SkiaRenderContext}.
 *
 * Everything about *how a frame is drawn* — shapes, fills, strokes, text, effects,
 * clips, masks, the camera, the 3D composite — lives in
 * `@motion-script/skia-render` and is shared with every other backend. What is
 * genuinely browser-specific is only the two things below: creating a WebGL-backed
 * Skia surface over a `<canvas>`, and encoding a snapshot (this CanvasKit build
 * ships no wasm image encoders, so the encode has to come from the host).
 */
export class WebRenderContext extends SkiaRenderContext {
    constructor(canvasKit: CanvasKit, storageAdapter: WebStorageAdapter) {
        super(canvasKit, storageAdapter);
    }

    /** Attaches a WebGL CanvasKit surface to `canvas`, remounting if already mounted (HMR/StrictMode). */
    mount(canvas: HTMLCanvasElement): void {
        const surface = this.canvasKit.MakeWebGLCanvasSurface(canvas);
        if (!surface) throw new Error("Failed to create CanvasKit surface");
        this.attach(surface);
    }

    /**
     * Core declares `unmount()`; it is `detach()` on the portable base, since
     * "unmount" only means anything where there is a DOM element to unmount from.
     */
    override unmount(): void {
        this.detach();
    }

    /**
     * Snapshots the current surface and encodes it as an image data URL through a
     * 2D canvas. Defaults to PNG; pass `mime`/`quality` (e.g. `"image/jpeg", 0.9`)
     * for other formats.
     */
    override screenshot(mime: string = "image/png", quality?: number): string | undefined {
        const snapshot = this.snapshotPixels();
        if (!snapshot) return undefined;
        const { pixels, width, height } = snapshot;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        // `pixels` is already unpremultiplied RGBA8888 copied out of the wasm heap,
        // which is exactly ImageData's layout.
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
        // A data: URL rather than a blob: URL — both work as an <img> src and a
        // data URL needs no revoke. `quality` is honored only by lossy formats
        // (e.g. image/jpeg); the browser ignores it for image/png.
        return canvas.toDataURL(mime, quality);
    }
}
