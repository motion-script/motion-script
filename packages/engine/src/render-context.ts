import type { CanvasKit } from '@motion-script/canvaskit';
import { SkiaRenderContext } from '@motion-script/skia-render/render-context';
import { encodePng } from './png.js';
import { EngineError } from './errors.js';
import type { NodeStorageAdapter } from './storage-adapter.js';

/**
 * Node bindings for {@link SkiaRenderContext}.
 *
 * As thin as the browser's, and for the same reason: everything about *how a
 * frame is drawn* lives in `@motion-script/skia-render` and is shared. What
 * differs is only where the pixels land — a raster surface in the wasm heap
 * rather than a WebGL surface over a `<canvas>`.
 *
 * That surface is a CPU rasterizer, which is the trade this backend makes. It
 * is slower per frame than the browser's GPU path, and in exchange it needs no
 * display, no GPU and no driver — so it runs the same on a laptop and in a
 * scratch container, and produces identical pixels on both.
 */
/**
 * What {@link RenderWorker} needs from a render context: `SkiaRenderContext`'s
 * portable drawing surface, plus how a CPU raster surface of a given device
 * size is created and torn down.
 *
 * {@link NodeRenderContext} is the default implementation. A host that wants a
 * different Skia platform binding underneath — a native rust-skia build, say —
 * supplies its own class shaped like this instead, via
 * {@link EngineOptions.createRenderContext}. This is the same seam
 * `@motion-script/web`'s `WebRenderContext` fills in the browser: everything
 * about *how a frame is drawn* stays in `@motion-script/skia-render` and is
 * shared, only surface creation differs.
 */
export interface NodeRenderBackend extends SkiaRenderContext {
    mount(width: number, height: number): void;
    matches(width: number, height: number): boolean;
}

/** Builds the render context a {@link RenderWorker} mounts into. See {@link NodeRenderBackend}. */
export type RenderContextFactory = (
    canvasKit: CanvasKit,
    storageAdapter: NodeStorageAdapter,
) => NodeRenderBackend;

export class NodeRenderContext extends SkiaRenderContext {
    private width = 0;
    private height = 0;
    /** Tracked here because the base class keeps its own `mounted` flag private. */
    private attached = false;

    constructor(canvasKit: CanvasKit, storageAdapter: NodeStorageAdapter) {
        super(canvasKit, storageAdapter);
    }

    /**
     * Create a raster surface of `width × height` device pixels and draw into
     * it, replacing any surface already mounted.
     *
     * The size is in device pixels, so callers multiply the viewport by the
     * scale they want before calling — the same arithmetic the browser backend
     * does when it sizes its canvas.
     */
    mount(width: number, height: number): void {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        const surface = this.canvasKit.MakeSurface(w, h);
        if (!surface) {
            throw new EngineError(
                'RENDER_FAILED',
                `Could not create a ${w}×${h} raster surface. That size may exceed available memory.`,
            );
        }
        this.width = w;
        this.height = h;
        this.attached = true;
        this.attach(surface);
    }

    /** Whether a surface of exactly this device size is already mounted. */
    matches(width: number, height: number): boolean {
        return this.attached
            && this.width === Math.max(1, Math.round(width))
            && this.height === Math.max(1, Math.round(height));
    }

    /** Core declares `unmount()`; on the portable base it is `detach()`. */
    override unmount(): void {
        this.width = 0;
        this.height = 0;
        this.attached = false;
        this.detach();
    }

    /**
     * Snapshot the surface as a PNG data URL.
     *
     * Part of the base contract rather than something this backend needs — the
     * engine's own still path encodes through an {@link ImageEncoder} and never
     * calls this. Implemented anyway so a host embedding the context directly
     * gets the same affordance the browser one has.
     */
    override screenshot(mime: string = 'image/png', _quality?: number): string | undefined {
        if (mime !== 'image/png') return undefined;
        const snapshot = this.snapshotPixels();
        if (!snapshot) return undefined;
        const bytes = encodePng(snapshot.pixels, snapshot.width, snapshot.height);
        return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    }
}
