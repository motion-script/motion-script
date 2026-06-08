import type {
    CanvasKit,
    Canvas,
    Surface,
    Paint,
} from "@motion-script/canvaskit";
import {
    type BooleanOperation,
    type ClipShape,
    type EllipseState,
    type FillProp,
    type FillResolved,
    type FillSpace,
    type ImageState,
    type ShadowProp,
    type ShadowResolved,
    type StrokeProp,
    type StrokeResolved,
    type LineState,
    type MaskOptions,
    type PathState,
    PathBuilder,
    type PolygonState,
    type PolygramState,
    type RectState,
    type Render2DPaintContext,
    RenderContext,
    type RichTextState,
    type SpaceRect,
    type SpaceRects,
    type TextState,
    type TransformState,
    type Vector2,
    type BulgePinchEffect,
    type ZoomEffect,
    type FontStyle,
    type SkSLEffect,

    withImageDescriptor,
    withRichTextDescriptor,
    resolveFillArray,
    resolveStrokeArray,
    resolveShadowArray,

} from "@motion-script/core";


import { layoutRichText } from "./shapes/richtext";
import { drawShapedRun, layoutParagraph } from "./shapes/paragraph-layout";
import { ImageNodeRenderer } from "./shapes/image";
import { RectShape } from "./shapes/rect";
import { EllipseShape } from "./shapes/ellipse";
import { PolygonShape } from "./shapes/polygon";
import { PolygramShape } from "./shapes/polygram";
import { PathShape } from "./shapes/path";
import { LineShape } from "./shapes/line";
import type { CurrentShape } from "./shapes/shape-handler";
import { CanvasKitEffectRegistry } from "./effects/registry";
import { makeBulgePinchShader, disposeBulgePinch } from "./effects/bulge-pinch";
import { makeZoomShader, disposeZoom } from "./effects/zoom";
import { getOrCompileSkSL, disposeSkSLCache } from "./effects/sksl-cache";
import { StrokeHandler } from "./stroke/stroke-handler";
import { ShapeHandler } from "./shapes/shape-handler";
import { FillHandler } from "./fills/handler";
import { WebStorageAdapter } from "./storage-adapter";

type DeferredPaintCall =
    | { kind: 'fill'; shapes: CurrentShape[]; fills: FillResolved[]; shadows: ShadowResolved[] | null }
    | { kind: 'stroke'; shapes: CurrentShape[]; strokes: StrokeResolved[]; shadows: ShadowResolved[] | null };

/**
 * CanvasKit/Skia implementation of {@link RenderContext} — the main render
 * loop driving a mounted `<canvas>` (or an offscreen one during export).
 * Owns the WebGL surface and the per-frame draw stack (transforms, clips,
 * masks, camera, backdrop effects); delegates shape/fill/stroke painting to
 * the handlers built in {@link buildHandlers}. All async asset work happens
 * up front in {@link WebStorageAdapter} so render() stays synchronous per frame.
 */
export class WebRenderContext extends RenderContext {
    private currentCanvas!: Canvas;
    private canvasKit!: CanvasKit;
    private canvasElement!: HTMLCanvasElement;
    private surface!: Surface;
    private paint!: Paint;
    private layerPaint!: Paint;
    private mounted: boolean = false;
    private isRendering: boolean = false;

    // Tracks extra saveLayer() calls pushed by transform() for each begin()/end() pair.
    private effectLayerStack: number[] = [];

    private clipRestoreStack: number[] = [];

    private fillHandler!: FillHandler;
    private strokeHandler!: StrokeHandler;
    private shapeHandler!: ShapeHandler;
    private imageRenderer!: ImageNodeRenderer;

    // Per-mask-scope deferred paint calls (filled by stroke/fill when apply filtering is active).
    // Each entry on the stack corresponds to one active mask scope.
    private deferredPaintsStack: DeferredPaintCall[][] = [];

    // Pending image state collected by `image()` until paint methods are called.
    private pendingImage: Partial<ImageState> | null = null;
    private pendingImageShadows: ShadowResolved[] = [];
    private pendingImageFills: FillResolved[] = [];
    private pendingImageStrokes: StrokeResolved[] = [];
    // Initialized in init() once CanvasKit is loaded.
    storageAdapter!: WebStorageAdapter;


    constructor(canvasKit: CanvasKit, storageAdapter: WebStorageAdapter) {
        super();
        this.canvasKit = canvasKit;
        this.storageAdapter = storageAdapter;
        this.paint = new this.canvasKit.Paint();
        this.paint.setAntiAlias(true);
        this.layerPaint = new this.canvasKit.Paint();

        this.buildHandlers();
    }
    measureText(text: string, fontSize: number, fontFamily: string, fontWeight: number = 400, letterSpacing: number = 0, fontStyle: FontStyle = 'normal'): number {
        if (text.length === 0) return 0;
        const fontMgr = this.storageAdapter.getFontMgr();
        const layout = layoutParagraph(
            this.canvasKit,
            fontMgr,
            [{ text, fontFamily, fontSize, fontWeight, letterSpacing, fontStyle }],
            { align: 'center', lineHeight: 1, maxWidth: Infinity, originX: 0, originY: 0 },
        );
        const w = layout.width;
        for (const f of layout.fonts) f.delete();
        return w;
    }
    private buildHandlers(): void {
        const getCanvas = () => this.currentCanvas;
        const getPaint = () => this.paint;

        this.shapeHandler = new ShapeHandler(
            this.canvasKit,
            getCanvas,
            getPaint,
            this.storageAdapter.getFontMgr(),
        );

        this.fillHandler = new FillHandler(
            this.canvasKit,
            getPaint,
            getCanvas,
            () => this.shapeHandler.getShapeBounds(),
            (space) => this.spaceRect(space),
            this.storageAdapter,
        );

        this.strokeHandler = new StrokeHandler(
            this.canvasKit,
            getCanvas,
            getPaint,
            this.fillHandler,
        );

        this.imageRenderer = new ImageNodeRenderer(
            this.canvasKit,
            getCanvas,
            getPaint,
            this.storageAdapter,
            this.fillHandler,
            this.shapeHandler,
            this.strokeHandler,
        );
    }

    private flushPendingImage(): void {
        if (!this.pendingImage) return;
        const state = withImageDescriptor(this.pendingImage);
        this.imageRenderer.draw(
            state,
            this.pendingImageShadows,
            this.pendingImageFills,
            this.pendingImageStrokes,
        );
        this.pendingImage = null;
        this.pendingImageShadows = [];
        this.pendingImageFills = [];
        this.pendingImageStrokes = [];
    }

    pixelRatio: number = 1;

    private renderPass(callback: () => void): void {
        // The surface is freed on dispose()/unmount(). A late async render (e.g. a
        // seek resolving after a StrictMode/HMR remount disposed this context)
        // would otherwise call getCanvas() on a deleted Surface and throw.
        if (!this.mounted || !this.surface) return;
        this.currentCanvas = this.surface.getCanvas();
        this.currentCanvas.clear(this.canvasKit.BLACK);
        this.currentCanvas.save();
        const logicalW = this.surface.width() / this.pixelRatio;
        const logicalH = this.surface.height() / this.pixelRatio;
        this.currentCanvas.scale(this.pixelRatio, this.pixelRatio);
        this.currentCanvas.translate(logicalW / 2, logicalH / 2);
        this.isRendering = true;
        callback();
        this.isRendering = false;
        this.currentCanvas.restore();
        this.surface.flush();
    }

    begin(id: string, rects?: SpaceRects): void {
        super.begin(id, rects);
        this.shapeHandler.beginNode(id);
        this.shapeHandler.reset();
        if (!this.currentCanvas) {
            throw new Error("begin() must be called within the draw() method.");
        }
        this.effectLayerStack.push(0);
        this.currentCanvas.save();
    }

    end(): void {
        if (!this.currentCanvas) {
            throw new Error("end() must be called within the draw() method.");
        }
        this.flushPendingImage();
        const extraLayers = this.effectLayerStack.pop() ?? 0;
        for (let i = 0; i < extraLayers; i++) {
            this.currentCanvas.restore();
        }
        this.currentCanvas.restore();
        super.end();
    }

    dispose(): void {
        this.fillHandler?.dispose();
        this.shapeHandler?.dispose();
        this.storageAdapter.dispose();
        if (this.surface) {
            this.surface.dispose();
        }
        // Intentionally do NOT call loseContext() on the canvas — the canvas
        // element survives this component (HMR/StrictMode remount it), and a
        // fresh CanvasKit surface needs a live WebGL context to attach to.
        this.mounted = false;
        this.canvasKit = undefined as any;
        this.paint?.delete();
        this.paint = undefined as any;
        this.layerPaint?.delete();
        this.layerPaint = undefined as any;
        this.currentCanvas = undefined as any;
        this.effectLayerStack.length = 0;
        this.clipRestoreStack.length = 0;
        this.deferredPaintsStack.length = 0;
        this.backgroundBlurStack.length = 0;
        this.backgroundDistortionStack.length = 0;
        this.backdropSkSLStack.length = 0;
        disposeBulgePinch();
        disposeZoom();
        disposeSkSLCache();

        super.dispose();
    }

    /** Runs one synchronous draw pass (`callback`) against the mounted surface. */
    async render(callback: () => void): Promise<void> {
        await this.renderPass(callback);
    }

    /** Attaches a WebGL CanvasKit surface to `canvas`, remounting if already mounted (HMR/StrictMode). */
    mount(canvas: HTMLCanvasElement): void {
        if (this.mounted) this.unmount();
        this.canvasElement = canvas;
        const surface = this.canvasKit.MakeWebGLCanvasSurface(canvas);
        if (!surface) throw new Error("Failed to create CanvasKit surface");
        this.surface = surface;
        this.mounted = true;
    }

    unmount(): void {
        if (this.mounted) {
            this.surface.dispose();
            this.mounted = false;
        }
    }

    /** Snapshots the current surface and encodes it as a PNG data URL via the browser's canvas (CanvasKit ships no wasm encoders). */
    screenshot(): string | undefined {
        if (!this.mounted) {
            console.warn("screenshot() must be called after mount().");
            return undefined;
        }
        this.surface.flush();
        const image = this.surface.makeImageSnapshot();
        if (!image) return undefined;
        const ck = this.canvasKit;
        const w = image.width();
        const h = image.height();
        // This CanvasKit build ships no wasm image encoders (encoding is handled
        // by mediabunny / the browser). Read straight to unpremultiplied RGBA so
        // it maps 1:1 onto ImageData, then let the browser do the PNG encode.
        const pixels = image.readPixels(0, 0, {
            width: w,
            height: h,
            colorType: ck.ColorType.RGBA_8888,
            alphaType: ck.AlphaType.Unpremul,
            colorSpace: ck.ColorSpace.SRGB,
        }) as Uint8Array | null;
        image.delete();
        if (!pixels) return undefined;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        // Copy out of the wasm heap before handing the buffer to ImageData.
        const imageData = new ImageData(new Uint8ClampedArray(pixels), w, h);
        ctx.putImageData(imageData, 0, 0);
        // Returns a data: URL (was a blob: URL before); both work as an <img> src
        // and a data URL needs no revoke.
        return canvas.toDataURL("image/png");
    }

    /** Wraps the just-flushed canvas as a `VideoFrame` for the export pipeline (mediabunny's `CanvasSource`). */
    captureVideoFrame(timestampUs: number, durationUs: number): VideoFrame | undefined {
        if (!this.mounted) {
            console.warn("captureVideoFrame() must be called after mount().");
            return undefined;
        }
        this.surface.flush();
        return new VideoFrame(this.canvasElement as CanvasImageSource, {
            timestamp: timestampUs,
            duration: durationUs,
        });
    }



    // ─── Draw commands ───────────────────────────────────────────────────────

    /** Applies the node's transform to the canvas and, when opacity < 1 or effects are present, pushes a `saveLayer` tracked in {@link effectLayerStack} for `end()` to unwind. */
    transform(state: Partial<TransformState>): RenderContext {
        if (!this.isRendering) {
            console.warn("transform() must be called within the draw() method.");
            return this;
        }

        const x = state.x ?? 0;
        const y = state.y ?? 0;
        const width = state.width ?? 0;
        const height = state.height ?? 0;
        const opacity = state.opacity ?? 1;
        const rotate = state.rotation ?? 0;
        const scale = state.scale ?? 1;
        const effects = state.effects ?? [];
        const pivot = state.pivot ?? { x: 0, y: 0 };

        const pivotX = pivot.x * (width / 2);
        const pivotY = -pivot.y * (height / 2);

        this.currentCanvas.translate(x + pivotX, y + pivotY);
        this.currentCanvas.rotate(rotate, 0, 0);
        this.currentCanvas.scale(scale, scale);
        this.currentCanvas.translate(-pivotX, -pivotY);

        let effectFilter: any = null;
        if (effects.length > 0) {
            const w = this.surface.width();
            const h = this.surface.height();
            effectFilter = CanvasKitEffectRegistry.composeFilters(effects, this.canvasKit, w, h);
        }

        const needsLayer = opacity < 1 || effectFilter != null;
        if (needsLayer) {
            this.layerPaint.setAlphaf(opacity < 1 ? opacity : 1);
            this.layerPaint.setImageFilter(effectFilter ?? null);
            this.currentCanvas.saveLayer(this.layerPaint);
            this.layerPaint.setAlphaf(1);
            this.layerPaint.setImageFilter(null);
            this.effectLayerStack[this.effectLayerStack.length - 1]++;
        }

        return this;
    }

    // Resolve the reference rect for a fill `space`, in the current node's local
    // space. `parent` is supplied by the node via begin(); `view` is the render
    // viewport mapped from device space through the inverse current matrix.
    private spaceRect(space: FillSpace): SpaceRect | null {
        if (space === "parent") {
            return this.currentSpaceRects().parent ?? null;
        }
        if (space === "view") {
            const m = this.currentCanvas?.getTotalMatrix();
            if (!m) return null;
            const inv = this.canvasKit.Matrix.invert(m);
            if (!inv) return null;
            // Surface corners in device px → local space.
            const w = this.surface.width();
            const h = this.surface.height();
            const tl = this.canvasKit.Matrix.mapPoints(inv, [0, 0]);
            const br = this.canvasKit.Matrix.mapPoints(inv, [w, h]);
            return {
                left: Math.min(tl[0], br[0]),
                top: Math.min(tl[1], br[1]),
                right: Math.max(tl[0], br[0]),
                bottom: Math.max(tl[1], br[1]),
            };
        }
        return null;
    }

    rect(state: Partial<RectState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("fillRect must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.rect(state);
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        return this;
    }

    ellipse(state: Partial<EllipseState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("ellipse must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.ellipse(state);
        return this;
    }

    path(state: Partial<PathState> | PathBuilder): Render2DPaintContext {
        if (!this.currentCanvas) {
            console.warn("path() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.path(state instanceof PathBuilder ? state.toPathState() : state);
        return this;
    }

    line(state: Partial<LineState>): Render2DPaintContext {
        if (!this.currentCanvas) {
            console.warn("line() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.line(state);
        return this;
    }

    polygon(state: Partial<PolygonState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("polygon() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygon(state);
        return this;
    }

    polygram(state: Partial<PolygramState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("polygram() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygram(state);
        return this;
    }

    text(state: Partial<TextState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("text() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.text(state);
        return this;
    }

    /** Lays out spans/runs and paints each run's fill/stroke immediately (rich text carries per-span paint, bypassing the usual `.fill()/.stroke()` chain). */
    richText(state: Partial<RichTextState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("richText() must be called within the draw() method.");
            return this;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();

        const fullState = withRichTextDescriptor(state);
        const layout = layoutRichText(
            this.canvasKit,
            this.storageAdapter.getFontMgr(),
            fullState,
        );

        // Spans carry their own resolved fills/strokes, so we draw eagerly
        // here rather than going through the .fill()/.stroke() chain. Push
        // the overall bounds so any per-run gradient resolves against the
        // whole rich-text box, not just the run.
        this.shapeHandler.pushBounds(layout.bounds);
        try {
            for (const run of layout.runs) {
                if (run.glyphs.length === 0) continue;
                const shape = {
                    isText: true,
                    draw: (paint: Paint) => {
                        drawShapedRun(this.currentCanvas, run, paint);
                    },
                };
                if (run.span.fill.length > 0) {
                    this.fillHandler.applyFills(run.span.fill, [shape]);
                }
                if (run.span.stroke.length > 0) {
                    this.strokeHandler.applyStrokes(run.span.stroke, [shape]);
                }
            }
        } finally {
            this.shapeHandler.popBounds();
            for (const font of layout.fonts) font.delete();
        }

        return this;
    }

    /** Defers drawing until a chained `.fill()/.stroke()/.shadow()` or the next shape call flushes via {@link flushPendingImage} — lets images join the same paint-context chaining as other shapes. */
    image(state: Partial<ImageState>): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("image() must be called within the draw() method.");
            return this.imagePaintCtx;
        }
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.pendingImage = state;
        this.pendingImageShadows = [];
        this.pendingImageFills = [];
        this.pendingImageStrokes = [];
        return this.imagePaintCtx;
    }

    /** @internal */ _appendImageShadows(s: ShadowResolved[]): void {
        if (this.pendingImage && s.length > 0) this.pendingImageShadows.push(...s);
    }
    /** @internal */ _appendImageFills(f: FillResolved[]): void {
        if (this.pendingImage && f.length > 0) this.pendingImageFills.push(...f);
    }
    /** @internal */ _appendImageStrokes(s: StrokeResolved[]): void {
        if (this.pendingImage && s.length > 0) this.pendingImageStrokes.push(...s);
    }

    private imagePaintCtx: Render2DPaintContext = new WebImagePaintContext(this);

    fill(fills: FillProp | FillProp[]): Render2DPaintContext {
        const resolved = resolveFillArray(fills);
        if (resolved.length === 0) return this;
        if (!this.isRendering) {
            console.warn("fill() must be called within the draw() method.");
            return this;
        }
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return this;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('fill')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'fill', shapes: [...this.shapeHandler.shapes], fills: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return this;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const space = pendingShadows[0].fill.space ?? "global";
            const { shapes, dispose } = this.strokeShapesForSpace(space);
            this.strokeHandler.applyShadows(pendingShadows, shapes, resolved, [], this.applyFillSpaceBounds);
            dispose();
        }
        this.fillHandler.applyFills(resolved, this.shapeHandler.shapes);
        this.shapeHandler.paintApplied = true;
        return this;
    }

    // Set the fill handler's bounds for a fill, honouring its `space`. Used as
    // the per-shape resolveBounds hook for stroke/shadow shaders.
    private applyFillSpaceBounds = (
        fill: FillResolved,
        shape: { ckPath?: any } | null,
    ): void => {
        this.fillHandler.setCurrentBounds(this.fillHandler.boundsForSpace(fill.space ?? "global", shape));
    };

    // Pick the shapes a stroke/shadow should be drawn over for the given space.
    // `local` strokes each shape individually; every other space strokes the
    // union outline so overlapping shapes show no internal seams. Returns the
    // shape list plus a disposer for any transient union path.
    private strokeShapesForSpace(space: FillSpace): {
        shapes: Array<{ draw: (p: any) => void; ckPath?: any }>;
        dispose: () => void;
    } {
        if (space === "local") {
            return { shapes: this.shapeHandler.shapes, dispose: () => { } };
        }
        const union = this.shapeHandler.unionStrokeShape();
        if (union) {
            return { shapes: [union], dispose: () => union.ckPath?.delete() };
        }
        return { shapes: this.shapeHandler.shapes, dispose: () => { } };
    }

    stroke(strokes: StrokeProp | StrokeProp[]): Render2DPaintContext {
        const resolved = resolveStrokeArray(strokes);
        if (resolved.length === 0) return this;
        if (!this.currentCanvas) {
            console.warn("stroke() must be called within the draw() method.");
            return this;
        }
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return this;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('stroke')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'stroke', shapes: [...this.shapeHandler.shapes], strokes: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return this;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const shadowSpace = pendingShadows[0].fill.space ?? "global";
            const { shapes: shadowShapes, dispose: shadowDispose } = this.strokeShapesForSpace(shadowSpace);
            this.strokeHandler.applyShadows(pendingShadows, shadowShapes, [], resolved, this.applyFillSpaceBounds);
            shadowDispose();
        }
        // The first stroke's space decides geometry grouping (local = per shape,
        // else union outline). Bounds for each stroke's shader are resolved per
        // shape from that stroke's own fill space.
        const space = resolved[0].fill.space ?? "global";
        const { shapes, dispose } = this.strokeShapesForSpace(space);
        this.strokeHandler.applyStrokes(resolved, shapes, this.applyFillSpaceBounds);
        dispose();
        this.shapeHandler.paintApplied = true;
        return this;
    }

    shadow(shadows: ShadowProp | ShadowProp[]): Render2DPaintContext {
        const resolved = resolveShadowArray(shadows);
        if (resolved.length === 0) return this;
        if (!this.isRendering) {
            console.warn("shadow() must be called within the draw() method.");
            return this;
        }
        if (this.shapeHandler.isCollectingPaths()) return this;
        this.shapeHandler.storePendingShadows(resolved);
        return this;
    }

    cut(): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("cut() must be called within the draw() method.");
            return this;
        }
        this.shapeHandler.cut();
        return this;
    }

    // ─── Camera viewport ─────────────────────────────────────────────────────

    private cameraRestoreStack: number[] = [];

    beginCamera(viewport: { x: number; y: number; width: number; height: number }, centerOn: Vector2, zoom: number, heading: number): void {
        if (!this.isRendering) {
            console.warn("beginCamera() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        const ck = this.canvasKit;

        canvas.save();
        const left = viewport.x - viewport.width / 2;
        const top = viewport.y - viewport.height / 2;
        const right = viewport.x + viewport.width / 2;
        const bottom = viewport.y + viewport.height / 2;
        canvas.clipRect(ck.LTRBRect(left, top, right, bottom), ck.ClipOp.Intersect, true);

        canvas.save();
        canvas.translate(viewport.x, viewport.y);
        canvas.rotate(-heading, 0, 0);
        canvas.scale(zoom, zoom);
        canvas.translate(-centerOn.x, centerOn.y);

        this.cameraRestoreStack.push(2);
    }

    endCamera(): void {
        if (!this.isRendering) {
            console.warn("endCamera() must be called within the draw() method.");
            return;
        }
        const restores = this.cameraRestoreStack.pop() ?? 0;
        for (let i = 0; i < restores; i++) {
            this.currentCanvas.restore();
        }
    }

    // ─── Clip scope ──────────────────────────────────────────────────────────

    beginClipRect(state: Partial<RectState>): void {
        if (!this.isRendering) {
            console.warn("beginClipRect() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        canvas.save();
        const shape = new RectShape(this.canvasKit, canvas, state);
        shape.clip(/* isolated= */ true);
        if (shape.ckPath) shape.ckPath.delete();
        this.clipRestoreStack.push(1);
    }

    beginClipEllipse(state: Partial<EllipseState>): void {
        if (!this.isRendering) {
            console.warn("beginClipEllipse() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        canvas.save();
        const shape = new EllipseShape(this.canvasKit, canvas, state);
        shape.clip(/* isolated= */ true);
        if (shape.ckPath) shape.ckPath.delete();
        this.clipRestoreStack.push(1);
    }

    endClip(): void {
        if (!this.isRendering) {
            console.warn("endClip() must be called within the draw() method.");
            return;
        }
        const restores = this.clipRestoreStack.pop() ?? 0;
        for (let i = 0; i < restores; i++) {
            this.currentCanvas.restore();
        }
    }

    private buildClipShape(shape: ClipShape): CurrentShape | null {
        const ck = this.canvasKit;
        const canvas = this.currentCanvas;
        // Call clip(true) to apply the clip (uses native clipRect/clipRRect when possible),
        // then return a stub CurrentShape only if a ckPath was built so beginClipShape
        // can delete it. Returns null when the clip was applied without a path.
        let s: RectShape | EllipseShape | PolygonShape | PolygramShape | PathShape | LineShape;
        switch (shape.kind) {
            case "rect": s = new RectShape(ck, canvas, shape.state); break;
            case "ellipse": s = new EllipseShape(ck, canvas, shape.state); break;
            case "polygon": s = new PolygonShape(ck, canvas, shape.state); break;
            case "polygram": s = new PolygramShape(ck, canvas, shape.state); break;
            case "path": s = new PathShape(ck, canvas, shape.state); break;
            case "line": s = new LineShape(ck, canvas, shape.state); break;
        }
        s.clip(true);
        return s.ckPath ? { draw: () => { }, ckPath: s.ckPath } : null;
    }

    beginClipShape(shape: ClipShape): void {
        if (!this.isRendering) {
            console.warn("beginClipShape() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        canvas.save();
        const built = this.buildClipShape(shape);
        if (built?.ckPath) {
            canvas.clipPath(built.ckPath, this.canvasKit.ClipOp.Intersect, true);
            built.ckPath.delete();
        }
        this.clipRestoreStack.push(1);
    }

    // ─── Background blur ───────────────────────────────────────────────────────

    // Tracks the layer pushed by beginBackgroundBlur so endBackgroundBlur can
    // pop exactly that many — kept as a stack to allow nesting.
    private backgroundBlurStack: number[] = [];

    beginBackgroundBlur(radius: number): void {
        if (!this.isRendering) {
            console.warn("beginBackgroundBlur() must be called within the draw() method.");
            return;
        }
        if (radius <= 0) {
            this.backgroundBlurStack.push(0);
            return;
        }
        const ck = this.canvasKit;
        // Blur radius is given in logical px; the surface is scaled by pixelRatio,
        // and sigma ≈ radius/2 matches the node `blur` effect's mapping.
        const sigma = (radius * this.pixelRatio) / 2;
        const backdrop = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Clamp, null);
        // saveLayer with a backdrop filter seeds the new layer with the current
        // canvas content run through `backdrop`. Clamp tiling samples beyond the
        // active clip so the blur doesn't darken toward the silhouette edge. The
        // layer is bounded by the active clip, so only the silhouette composites
        // back on restore.
        this.currentCanvas.saveLayer(undefined, null, backdrop, undefined, ck.TileMode.Clamp);
        backdrop.delete();
        this.backgroundBlurStack.push(1);
    }

    endBackgroundBlur(): void {
        if (!this.isRendering) {
            console.warn("endBackgroundBlur() must be called within the draw() method.");
            return;
        }
        const layers = this.backgroundBlurStack.pop() ?? 0;
        for (let i = 0; i < layers; i++) {
            this.currentCanvas.restore();
        }
    }

    // ─── Background distortion (bulge/pinch) ─────────────────────────────────────

    private backgroundDistortionStack: number[] = [];

    beginBackgroundDistortion(effect: BulgePinchEffect | ZoomEffect, width: number, height: number): void {
        if (!this.isRendering) {
            console.warn("beginBackgroundDistortion() must be called within the draw() method.");
            return;
        }
        const ck = this.canvasKit;
        // The node was already translated to its centre by applyTransform, so the
        // CTM maps the node's local origin (0,0) to its device centre, and the CTM
        // scale converts the node's logical size into device px for the lens.
        const m = this.currentCanvas.getTotalMatrix(); // row-major 3x3
        const centerX = m[2];
        const centerY = m[5];
        const sx = Math.hypot(m[0], m[3]);
        const sy = Math.hypot(m[1], m[4]);

        // Snapshot the content painted so far (the backdrop) and wrap it as a child
        // shader. The lens shader resamples this snapshot at bulge/pinch-remapped
        // device coordinates — a real magnifier, not a nudge.
        const snapshot = this.surface.makeImageSnapshot();
        const backdropShader = snapshot.makeShaderOptions(
            ck.TileMode.Clamp, ck.TileMode.Clamp, ck.FilterMode.Linear, ck.MipmapMode.None,
        );
        const lens = effect.type === "zoom"
            ? makeZoomShader(
                effect, ck, backdropShader, centerX, centerY, width * sx, height * sy,
            )
            : makeBulgePinchShader(
                effect, ck, backdropShader, centerX, centerY, width * sx, height * sy,
            );
        if (lens == null) {
            backdropShader.delete();
            snapshot.delete();
            this.backgroundDistortionStack.push(0);
            return;
        }

        // Draw the warped backdrop in device space (identity CTM, so fragCoord ==
        // snapshot px), bounded by the active silhouette clip — which is stored in
        // device space, so it survives the matrix reset. Only the node's shape
        // region is repainted with the distorted backdrop. CanvasKit has no
        // resetMatrix, so concat the inverse of the current CTM to reach identity.
        this.currentCanvas.save();
        const inverse = ck.Matrix.invert(m);
        if (inverse) this.currentCanvas.concat(inverse);
        const paint = new ck.Paint();
        paint.setShader(lens);
        paint.setAntiAlias(true);
        this.currentCanvas.drawRect(
            ck.LTRBRect(0, 0, this.surface.width(), this.surface.height()),
            paint,
        );
        paint.delete();
        lens.delete();
        backdropShader.delete();
        snapshot.delete();
        this.currentCanvas.restore();
        this.backgroundDistortionStack.push(0);
    }

    endBackgroundDistortion(): void {
        if (!this.isRendering) {
            console.warn("endBackgroundDistortion() must be called within the draw() method.");
            return;
        }
        // The distortion is painted entirely within begin(); the stack entry is kept
        // only for API symmetry with the other backdrop scopes.
        this.backgroundDistortionStack.pop();
    }

    // ─── Custom SkSL backdrop ─────────────────────────────────────────────────

    private backdropSkSLStack: number[] = [];

    beginBackdropSkSL(effect: SkSLEffect, width: number, height: number): void {
        if (!this.isRendering) {
            console.warn("beginBackdropSkSL() must be called within the draw() method.");
            return;
        }
        const ck = this.canvasKit;
        if (width <= 0 || height <= 0) {
            this.backdropSkSLStack.push(0);
            return;
        }

        const rte = getOrCompileSkSL(effect.shader, ck);
        if (!rte) {
            this.backdropSkSLStack.push(0);
            return;
        }

        // Read the current CTM so we can reset to device-space for the draw.
        const m = this.currentCanvas.getTotalMatrix();

        // Snapshot what's beneath the node (before any of the node's own draws).
        const snapshot = this.surface.makeImageSnapshot();
        const backdropShader = snapshot.makeShaderOptions(
            ck.TileMode.Clamp, ck.TileMode.Clamp, ck.FilterMode.Linear, ck.MipmapMode.None,
        );

        // Flatten user uniforms in declaration order.
        const flat = effect.uniforms.flatMap((u) =>
            typeof u.value === "number" ? [u.value] : u.value
        );

        // The first child shader is always u_backdrop.
        const shader = rte.makeShaderWithChildren(flat, [backdropShader]);

        // Draw the warped backdrop in device space (reset to identity via inverse CTM)
        // so fragCoord matches snapshot pixel coordinates. The active silhouette clip
        // (stored in device space) confines the repaint to the node's shape.
        this.currentCanvas.save();
        const inverse = ck.Matrix.invert(m);
        if (inverse) this.currentCanvas.concat(inverse);
        const paint = new ck.Paint();
        paint.setShader(shader);
        paint.setAntiAlias(true);
        this.currentCanvas.drawRect(
            ck.LTRBRect(0, 0, this.surface.width(), this.surface.height()),
            paint,
        );
        paint.delete();
        shader.delete();
        backdropShader.delete();
        snapshot.delete();
        this.currentCanvas.restore();

        this.backdropSkSLStack.push(0);
    }

    endBackdropSkSL(): void {
        if (!this.isRendering) {
            console.warn("endBackdropSkSL() must be called within the draw() method.");
            return;
        }
        this.backdropSkSLStack.pop();
    }

    drawWebGLCanvas(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): boolean {
        if (!this.isRendering || !this.surface) return false;
        const img = this.surface.makeImageFromTextureSource(
            canvas as unknown as ImageBitmap,
            {
                width: canvas.width,
                height: canvas.height,
                alphaType: this.canvasKit.AlphaType.Premul,
                colorType: this.canvasKit.ColorType.RGBA_8888,
                colorSpace: this.canvasKit.ColorSpace.SRGB,
            },
        );
        if (!img) return false;
        const ck = this.canvasKit;
        const paint = this.paint;
        paint.setStyle(ck.PaintStyle.Fill);
        paint.setAlphaf(1);
        paint.setBlendMode(ck.BlendMode.SrcOver);
        const half_w = w / 2;
        const half_h = h / 2;
        const dst = ck.LTRBRect(x - half_w, y - half_h, x + half_w, y + half_h);
        const src = ck.LTRBRect(0, 0, canvas.width, canvas.height);
        this.currentCanvas.drawImageRect(img, src, dst, paint);
        paint.setBlendMode(ck.BlendMode.SrcOver);
        paint.setAlphaf(1);
        img.delete();
        return true;
    }

    // ─── Boolean group ───────────────────────────────────────────────────────

    beginBoolean(op: BooleanOperation): void {
        if (!this.isRendering) {
            console.warn("beginBoolean() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.beginBoolean(op);
    }

    endBoolean(): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("endBoolean() must be called within the draw() method.");
            return this;
        }
        this.shapeHandler.endBoolean();
        return this;
    }

    // ─── Mask group ──────────────────────────────────────────────────────────

    mask(options?: MaskOptions): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("mask() must be called within the draw() method.");
            return this;
        }
        this.shapeHandler.beginMask(options);
        this.deferredPaintsStack.push([]);
        return this;
    }

    beginMask(options?: MaskOptions): void {
        if (!this.isRendering) {
            console.warn("beginMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.beginMask(options);
        this.deferredPaintsStack.push([]);
    }

    applyMask(): Render2DPaintContext {
        if (!this.isRendering) {
            console.warn("applyMask() must be called within the draw() method.");
            return this;
        }
        this.shapeHandler.applyMask();
        return this;
    }

    endMask(): void {
        if (!this.isRendering) {
            console.warn("endMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.endMask();
        const deferred = this.deferredPaintsStack.pop() ?? [];
        this.flushDeferredPaints(deferred);
    }

    /** Replays fill/stroke calls that were postponed by an active mask scope (see `mask`/`fill`/`stroke`), in original order, once the mask resolves at `endMask`. */
    private flushDeferredPaints(deferred: DeferredPaintCall[]): void {
        for (const d of deferred) {
            if (d.kind === 'stroke') {
                if (d.shadows) {
                    this.strokeHandler.applyShadows(d.shadows, d.shapes, [], d.strokes, this.applyFillSpaceBounds);
                }
                this.strokeHandler.applyStrokes(d.strokes, d.shapes, this.applyFillSpaceBounds);
            } else {
                if (d.shadows) {
                    this.strokeHandler.applyShadows(d.shadows, d.shapes, d.fills, [], this.applyFillSpaceBounds);
                }
                this.fillHandler.applyFills(d.fills, d.shapes);
            }
        }
    }
}

/** Paint-context returned by `image()`; routes `.fill/.stroke/.shadow` into the pending image's buffers and forwards shape calls back to the render context (which flushes the pending image first). */
class WebImagePaintContext implements Render2DPaintContext {
    constructor(private ctx: WebRenderContext) { }
    fill(fills: FillProp | FillProp[]): Render2DPaintContext {
        this.ctx._appendImageFills(resolveFillArray(fills));
        return this;
    }
    stroke(strokes: StrokeProp | StrokeProp[]): Render2DPaintContext {
        this.ctx._appendImageStrokes(resolveStrokeArray(strokes));
        return this;
    }
    shadow(shadows: ShadowProp | ShadowProp[]): Render2DPaintContext {
        this.ctx._appendImageShadows(resolveShadowArray(shadows));
        return this;
    }

    // Chaining a new shape after an image flushes the pending image (the shape
    // methods on the context do this) and starts the next shape on the context.
    rect(state: Partial<RectState>): Render2DPaintContext { return this.ctx.rect(state); }
    ellipse(state: Partial<EllipseState>): Render2DPaintContext { return this.ctx.ellipse(state); }
    text(state: Partial<TextState>): Render2DPaintContext { return this.ctx.text(state); }
    richText(state: Partial<RichTextState>): Render2DPaintContext { return this.ctx.richText(state); }
    path(state: Partial<PathState> | PathBuilder): Render2DPaintContext { return this.ctx.path(state); }
    line(state: Partial<LineState>): Render2DPaintContext { return this.ctx.line(state); }
    image(state: Partial<ImageState>): Render2DPaintContext { return this.ctx.image(state); }
    polygon(state: Partial<PolygonState>): Render2DPaintContext { return this.ctx.polygon(state); }
    polygram(state: Partial<PolygramState>): Render2DPaintContext { return this.ctx.polygram(state); }
    cut(): Render2DPaintContext { return this.ctx.cut(); }
    applyMask(): Render2DPaintContext { return this.ctx.applyMask(); }
    endMask(): void { this.ctx.endMask(); }
}
