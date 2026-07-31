import {
    AssetCatalog,
    createStill,
    Scene,
    setTheme,
    setVariables,
    type AssetManifest,
    type GlobalLayerConfig,
    type Size2D,
    type StillContent,
    type Theme,
    type Variables,
} from "@motion-script/core";
import {
    drawFrameAt,
    type DrawnFrame,
    type FrameSpec,
    type ScreenshotFormat,
} from "@motion-script/skia-render/export";
import { WebRenderContext } from "./render-context";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKit } from "./getter";

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };
const DEFAULT_VIEWPORT: Size2D = { width: 1920, height: 1080 };

/**
 * Anything a still can be rendered from: a scene (or several) to sample at a
 * frame, or a {@link StillContent} factory for content with no timeline.
 *
 * A factory rather than a node, because a scene is built more than once per
 * rendered frame and disposes its children between passes — see `createStill`.
 */
export type StillSource = Scene | Scene[] | StillContent;

/**
 * Which frame to draw, in whatever form is most convenient — a global frame
 * index, the timeline's first or last frame, or a `FrameSpec`.
 */
export type FrameRef = FrameSpec | number | "first" | "last";

export interface StillRendererOptions {
    /**
     * The canvas to draw into. Omit and the renderer creates its own hidden one
     * and removes it on {@link StillRenderer.dispose} — which is what a one-shot
     * capture wants, while a live preview passes the canvas it already shows.
     */
    canvas?: HTMLCanvasElement;
    /** Output resolution in pixels. Defaults to 1920×1080. */
    viewport?: Size2D;
    /** Frame rate, used to turn a `time` into a frame. Defaults to 60. */
    fps?: number;
    /** Device pixel ratio the surface is sized at. Defaults to 1. */
    scale?: number;
    manifest?: AssetManifest;
    theme?: Theme;
    variables?: Variables;
    /** Project-level nodes drawn over every scene (`ProjectConfig.overlays`). */
    overlays?: GlobalLayerConfig[];
    /** Project-level nodes drawn under every scene (`ProjectConfig.backgrounds`). */
    backgrounds?: GlobalLayerConfig[];
    wasmUrl?: string;
}

export interface RenderStillOptions {
    /** Which frame to draw. Defaults to the timeline's first. */
    frame?: FrameRef;
    /** Seconds into the timeline, converted with the renderer's `fps`. Wins over `frame`. */
    time?: number;
    /**
     * Draw at this pixel ratio instead of the renderer's. **Resizes the canvas and
     * rebuilds the Skia surface**, so keep it off the per-edit path — render the
     * preview at its normal scale and pass this only when capturing at a higher one.
     */
    scale?: number;
}

export interface EncodeStillOptions {
    /** Defaults to `"png"`. */
    format?: ScreenshotFormat;
    /** JPEG quality in [0,1]; ignored for png. Defaults to 0.92. */
    quality?: number;
}

/** Normalize the many ways a caller can name a frame into the engine's own form. */
export function toFrameSpec(options: RenderStillOptions | undefined, fps: number): FrameSpec {
    if (options?.time !== undefined) {
        return { kind: "frame", frame: Math.round(options.time * fps) };
    }
    const frame = options?.frame;
    if (frame === undefined || frame === "first") return { kind: "first" };
    if (frame === "last") return { kind: "last" };
    if (typeof frame === "number") return { kind: "frame", frame };
    return frame;
}

/** Coerce whatever the caller handed us into the scene list the engine drives. */
function toScenes(source: StillSource): Scene[] {
    if (source instanceof Scene) return [source];
    if (Array.isArray(source)) return source;
    // Anything else is a still factory, which `createStill` wraps into a
    // one-frame scene — and which rejects a bare node, since a scene is built
    // more than once per frame and disposes its children between passes.
    return [createStill(source)];
}

function mimeOf(format: ScreenshotFormat): string {
    return format === "jpeg" ? "image/jpeg" : "image/png";
}

/**
 * A long-lived single-frame renderer.
 *
 * Where `exportScreenshot` is one frame from a standing start, this keeps the
 * expensive things — the CanvasKit module, the WebGL Skia surface, and the
 * storage adapter's decoded-asset cache — alive across calls, so re-rendering
 * after an edit costs a precomp and a draw rather than a new GL context. That is
 * the difference between a one-off capture and a builder that repaints while the
 * user types.
 *
 * It is also the *same* draw: {@link render} goes through `drawFrameAt`, which is
 * the pass the video exporter runs per frame. A preview and its exported image
 * cannot drift apart, because there is only one path.
 *
 * ```ts
 * const renderer = await createStillRenderer({ canvas, viewport, manifest, theme });
 * await renderer.render(() => <Rect width="fill" height="fill" fill="bg" />);
 * const blob = await renderer.toBlob({ format: "png" });
 * renderer.dispose();
 * ```
 *
 * **Theme and variables are process-global in core.** {@link render} re-applies
 * this renderer's own before every draw, so two renderers with different themes
 * still each draw correctly; but anything else that calls `setTheme` between a
 * render and a read of the surface will have been overwritten by the next render.
 */
export class StillRenderer {
    readonly canvas: HTMLCanvasElement;

    private renderContext: WebRenderContext;
    private storageAdapter: WebStorageAdapter;
    private catalog: AssetCatalog;

    private readonly canvasKit: Awaited<ReturnType<typeof getCanvasKit>>;
    /** True when we made the canvas and must clean it up. */
    private readonly ownsCanvas: boolean;

    private viewportValue: Size2D;
    private readonly fpsValue: number;
    private scaleValue: number;
    private manifest: AssetManifest;
    private theme?: Theme;
    private variables?: Variables;
    private overlays?: GlobalLayerConfig[];
    private backgrounds?: GlobalLayerConfig[];
    private disposed = false;

    /** @internal Use {@link createStillRenderer}, which loads CanvasKit first. */
    constructor(
        canvasKit: Awaited<ReturnType<typeof getCanvasKit>>,
        options: StillRendererOptions,
    ) {
        this.canvasKit = canvasKit;
        this.viewportValue = options.viewport ?? DEFAULT_VIEWPORT;
        this.fpsValue = options.fps ?? 60;
        this.scaleValue = options.scale ?? 1;
        this.manifest = options.manifest ?? EMPTY_MANIFEST;
        this.theme = options.theme;
        this.variables = options.variables;
        this.overlays = options.overlays;
        this.backgrounds = options.backgrounds;

        this.ownsCanvas = options.canvas === undefined;
        this.canvas = options.canvas ?? document.createElement("canvas");
        if (this.ownsCanvas) {
            this.canvas.style.display = "none";
            document.body.appendChild(this.canvas);
        }
        this.sizeCanvas();

        this.catalog = new AssetCatalog(this.manifest);
        this.storageAdapter = new WebStorageAdapter(
            canvasKit, this.catalog, this.viewportValue, this.fpsValue,
        );
        this.renderContext = new WebRenderContext(canvasKit, this.storageAdapter);
        this.renderContext.mount(this.canvas);
    }

    get viewport(): Size2D { return this.viewportValue; }
    get fps(): number { return this.fpsValue; }
    get scale(): number { return this.scaleValue; }

    /**
     * Draw one frame of `source`.
     *
     * `source` may be a `Scene`/`Scene[]` to sample an animation at a frame, or a
     * `() => node` factory, in which case there is no generator to write and no
     * frame to choose. It must be a factory and not a node — the scene is rebuilt
     * on every render and disposes its children between passes.
     */
    async render(source: StillSource, options?: RenderStillOptions): Promise<DrawnFrame> {
        this.assertLive();
        const scale = options?.scale ?? this.scaleValue;
        if (scale !== this.scaleValue) {
            this.scaleValue = scale;
            this.remount();
        }

        // Re-applied per render, not once at construction: these are global
        // registries, so a second renderer (or the player) may have replaced them
        // since. Cheap — a map swap.
        setTheme(this.theme);
        setVariables(this.variables);

        return drawFrameAt({
            scenes: toScenes(source),
            viewport: this.viewportValue,
            fps: this.fpsValue,
            scale,
            manifest: this.manifest,
            overlays: this.overlays,
            backgrounds: this.backgrounds,
            renderContext: this.renderContext,
            storageAdapter: this.storageAdapter,
            assetCatalog: this.catalog,
            frame: toFrameSpec(options, this.fpsValue),
        });
    }

    setTheme(theme?: Theme): void { this.theme = theme; }
    setVariables(variables?: Variables): void { this.variables = variables; }
    setOverlays(overlays?: GlobalLayerConfig[]): void { this.overlays = overlays; }
    setBackgrounds(backgrounds?: GlobalLayerConfig[]): void { this.backgrounds = backgrounds; }

    /** Swap the asset manifest, keeping every decode already cached. */
    setManifest(manifest: AssetManifest): void {
        this.assertLive();
        this.manifest = manifest;
        this.catalog = new AssetCatalog(manifest);
        this.storageAdapter.setCatalog(this.catalog);
    }

    /**
     * Change the output resolution.
     *
     * A full reset, unlike {@link setManifest}: the viewport clamps the resolution
     * images are decoded *at*, so cached decodes made for the old one would be
     * soft at the new one, and the render context's handlers captured the adapter
     * when they were built — so both are rebuilt. Call this when the output format
     * changes, not per edit.
     */
    setViewport(viewport: Size2D): void {
        this.assertLive();
        if (viewport.width === this.viewportValue.width && viewport.height === this.viewportValue.height) {
            return;
        }
        this.viewportValue = viewport;
        // Disposing the context disposes the adapter it holds, so this releases
        // the old surface, its handlers and every decode in one call.
        this.renderContext.dispose();
        this.storageAdapter = new WebStorageAdapter(
            this.canvasKit, this.catalog, viewport, this.fpsValue,
        );
        this.renderContext = new WebRenderContext(this.canvasKit, this.storageAdapter);
        this.remount();
    }

    /** Encode the frame currently on the surface. */
    async toBytes(options?: EncodeStillOptions): Promise<Uint8Array> {
        const blob = await this.toBlob(options);
        return new Uint8Array(await blob.arrayBuffer());
    }

    /** Encode the frame currently on the surface. */
    toBlob(options?: EncodeStillOptions): Promise<Blob> {
        const canvas = this.snapshotToCanvas();
        const { format = "png", quality = 0.92 } = options ?? {};
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => blob
                    ? resolve(blob)
                    : reject(new Error("Still encode produced no data.")),
                mimeOf(format),
                quality,
            );
        });
    }

    /** Encode the frame currently on the surface. */
    toDataURL(options?: EncodeStillOptions): string {
        const { format = "png", quality = 0.92 } = options ?? {};
        return this.snapshotToCanvas().toDataURL(mimeOf(format), quality);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.renderContext.dispose();
        if (this.ownsCanvas) this.canvas.remove();
    }

    /**
     * Read the surface back into a 2D canvas, which is what actually encodes: this
     * CanvasKit build ships no wasm image encoders, so the browser's own codecs are
     * the only ones available.
     */
    private snapshotToCanvas(): HTMLCanvasElement {
        this.assertLive();
        const snapshot = this.renderContext.snapshotPixels();
        if (!snapshot) throw new Error("Nothing has been rendered yet.");

        const canvas = document.createElement("canvas");
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Still encode: could not get a 2d context.");
        // `pixels` is unpremultiplied RGBA8888, which is exactly ImageData's layout.
        ctx.putImageData(
            new ImageData(new Uint8ClampedArray(snapshot.pixels), snapshot.width, snapshot.height),
            0, 0,
        );
        return canvas;
    }

    private sizeCanvas(): void {
        this.canvas.width = this.viewportValue.width * this.scaleValue;
        this.canvas.height = this.viewportValue.height * this.scaleValue;
    }

    /** Resize the backing store and build a fresh Skia surface over it. */
    private remount(): void {
        this.sizeCanvas();
        this.renderContext.mount(this.canvas);
    }

    private assertLive(): void {
        if (this.disposed) throw new Error("This StillRenderer has been disposed.");
    }
}

/**
 * Create a {@link StillRenderer}, loading CanvasKit if it isn't already.
 *
 * `getCanvasKit` memoizes, so a second renderer in the same page is cheap.
 */
export async function createStillRenderer(
    options: StillRendererOptions = {},
): Promise<StillRenderer> {
    const canvasKit = await getCanvasKit(options.wasmUrl);
    return new StillRenderer(canvasKit, options);
}
