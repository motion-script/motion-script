import type {
    CanvasKit,
    Canvas,
    Surface,
    Paint,
    Path as CKPath,
    Shader,
} from "@motion-script/canvaskit";
import {
    type BooleanOperation,
    Clip,
    type ClipOp,
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
    type PolygonState,
    type PolygramState,
    type RectState,
    Graphics,
    type GraphicsOp,
    RenderContext,
    type RichTextState,
    type SpaceRect,
    type NodeRenderState,
    type TextState,
    type TransformState,
    type Vector2,
    type MotionBlurEffect,
    type FontStyle,
    type SceneEffect,
    type EffectTarget,
    type NodeBlendMode,

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
import { resolveMotionBlur } from "./effects/motion-blur";
import { ShaderEffectRegistry, type ShaderEffect, type ShaderEffectGeometry } from "./effects/shader-effect";
import { disposeBulge } from "./effects/bulge";
import { disposeMagnify } from "./effects/magnify";
import { disposePosterize } from "./effects/posterize";
import { disposeSkSLCache } from "./effects/sksl-cache";
import { StrokeHandler } from "./stroke/stroke-handler";
import { ShapeHandler } from "./shapes/shape-handler";
import { FillHandler } from "./fills/handler";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKitBlendMode } from "./blend";

type DeferredPaintCall =
    | { kind: 'fill'; shapes: CurrentShape[]; fills: FillResolved[]; shadows: ShadowResolved[] | null }
    | { kind: 'stroke'; shapes: CurrentShape[]; strokes: StrokeResolved[]; shadows: ShadowResolved[] | null };

/**
 * A foreground shader effect mid-flight: drawing is redirected into `offscreen`
 * until {@link WebRenderContext.endEffectScope} snapshots it and repaints it
 * through `handler`'s lens. `width`/`height` are the node's logical size,
 * `matrix` the CTM captured when the scope opened.
 */
type ForegroundCapture = {
    handler: ShaderEffect;
    effect: SceneEffect;
    width: number;
    height: number;
    savedCanvas: Canvas;
    offscreen: Surface;
    matrix: number[];
};

/** Map a {@link ShaderEffect} tile-mode literal to its CanvasKit enum. */
function tileMode(ck: CanvasKit, mode: "clamp" | "decal") {
    return mode === "decal" ? ck.TileMode.Decal : ck.TileMode.Clamp;
}

/** Map a {@link ShaderEffect} filter-mode literal to its CanvasKit enum. */
function filterMode(ck: CanvasKit, mode: "linear" | "nearest") {
    return mode === "nearest" ? ck.FilterMode.Nearest : ck.FilterMode.Linear;
}

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

    // Accumulated "world" alpha for pass-through nodes. A pass-through node does
    // not isolate, so its opacity is folded into every paint it draws (and into
    // its descendants') instead of being realised through a group saveLayer —
    // this is what lets a fill's blend mode keep mixing against the backdrop
    // while the node fades. begin() snapshots the inherited alpha, transform()
    // multiplies in the node's own opacity (pass-through) or resets to 1 inside
    // an isolating blend layer, and end() restores the snapshot.
    private worldAlpha = 1;
    private worldAlphaStack: number[] = [];

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

        const getWorldAlpha = () => this.worldAlpha;

        this.fillHandler = new FillHandler(
            this.canvasKit,
            getPaint,
            getCanvas,
            () => this.shapeHandler.getShapeBounds(),
            (space) => this.spaceRect(space),
            this.storageAdapter,
            getWorldAlpha,
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

    private executePass(callback: () => void): void {
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

    begin(state: NodeRenderState): void {
        super.begin(state);
        this.shapeHandler.beginNode(state.id);
        this.shapeHandler.reset();
        if (!this.currentCanvas) {
            throw new Error("begin() must be called within the draw() method.");
        }
        this.effectLayerStack.push(0);
        this.worldAlphaStack.push(this.worldAlpha);
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
        this.worldAlpha = this.worldAlphaStack.pop() ?? 1;
        this.currentCanvas.restore();
        super.end();
    }

    /** Accumulated pass-through alpha to fold into every paint this node draws. */
    currentWorldAlpha(): number {
        return this.worldAlpha;
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
        this.effectScopeStack.length = 0;
        disposeBulge();
        disposeMagnify();
        disposePosterize();
        disposeSkSLCache();

        super.dispose();
    }

    /** Runs one synchronous draw pass (`callback`) against the mounted surface. */
    async execute(callback: () => void): Promise<void> {
        await this.executePass(callback);
    }

    /** Attaches a WebGL CanvasKit surface to `canvas`, remounting if already mounted (HMR/StrictMode). */
    mount(canvas: HTMLCanvasElement): void {
        if (this.mounted) this.unmount();
        this.canvasElement = canvas;
        const surface = this.canvasKit.MakeWebGLCanvasSurface(canvas);
        if (!surface) throw new Error("Failed to create CanvasKit surface");
        this.surface = surface;
        this.mounted = true;
        // Hand the live surface to the adapter so video frames upload straight to
        // GPU texture (Surface.makeImageFromTextureSource) — no CPU readback.
        this.storageAdapter.setSurface(surface);
    }

    unmount(): void {
        if (this.mounted) {
            // Drop adapter-held GPU images tied to this surface before it dies, or
            // they become dangling texture handles on the next mount.
            this.storageAdapter.setSurface(null);
            this.surface.dispose();
            this.mounted = false;
        }
    }

    /**
     * Snapshots the current surface and encodes it as an image data URL via the
     * browser's canvas (CanvasKit ships no wasm encoders). Defaults to PNG;
     * pass `mime`/`quality` (e.g. `"image/jpeg", 0.9`) for other formats.
     */
    screenshot(mime: string = "image/png", quality?: number): string | undefined {
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
        // and a data URL needs no revoke. `quality` is honored only by lossy
        // formats (e.g. image/jpeg); the browser ignores it for image/png.
        return canvas.toDataURL(mime, quality);
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

    /**
     * Replay a built {@link Graphics} command list against this context. Shape
     * ops accumulate into the shape handler; paint ops (fill/stroke/shadow) paint
     * the accumulated shapes as one combined surface; cut/mask ops composite.
     *
     * A paint-only Graphics (no shape ops — e.g. the fill/stroke applied to a
     * boolean result after `endBoolean()`) does NOT reset the shape handler, so
     * it styles whatever surface is currently active.
     */
    draw(graphics: Graphics): void {
        if (!this.isRendering) {
            console.warn("draw() must be called within the draw() method.");
            return;
        }
        // Graphics-level opacity is pass-through: it folds into worldAlpha (so
        // the group's paints fade while their blend modes keep mixing against the
        // backdrop), mirroring a pass-through node transform. Effects still need
        // their own isolated buffer.
        const needsLayer = graphics.needsGroupLayer();
        const prevWorldAlpha = this.worldAlpha;
        let groupFilter: ReturnType<typeof CanvasKitEffectRegistry.composeFilters> | null = null;
        let pushedLayer = false;
        if (needsLayer) {
            const opacity = graphics.groupOpacity();
            // Backdrop-flagged effects run on the backdrop layer (applyBackdropEffects),
            // not the node's own content — exclude them from the foreground filter chain.
            const effects = graphics.groupEffects().filter((e) => !("backdrop" in e && e.backdrop));
            if (effects.length > 0) {
                const w = this.surface.width();
                const h = this.surface.height();
                groupFilter = CanvasKitEffectRegistry.composeFilters([...effects], this.canvasKit, w, h);
            }
            if (groupFilter != null) {
                this.layerPaint.setAlphaf(1);
                this.layerPaint.setImageFilter(groupFilter);
                this.currentCanvas.saveLayer(this.layerPaint);
                this.layerPaint.setImageFilter(null);
                pushedLayer = true;
            }
            if (opacity < 1) this.worldAlpha *= opacity;
        }

        // Graphics-level rotation/scale transforms the whole union as one figure.
        // It's realised as a canvas matrix about the pivot (default: the union's
        // bbox centre, sized in a throwaway measurement pass) wrapping the entire
        // op replay — so the combined silhouette turns/grows together and the CTM
        // change flows into fill/stroke space resolution.
        const groupTransform = graphics.groupTransform();
        let pushedTransform = false;
        if (groupTransform) {
            const center = groupTransform.center ?? this.measureUnionCenter(graphics);
            const cx = center.x;
            const cy = center.y;
            this.currentCanvas.save();
            this.currentCanvas.translate(cx, cy);
            this.currentCanvas.rotate(groupTransform.rotation, 0, 0);
            this.currentCanvas.scale(groupTransform.scale, groupTransform.scale);
            this.currentCanvas.translate(-cx, -cy);
            pushedTransform = true;
        }

        // Shape ops reset the shape handler as needed; a paint-only Graphics (e.g.
        // the fill/stroke for a boolean result left active by endBoolean) is
        // applied to the currently-active surface without resetting it.
        for (const op of graphics.ops()) {
            this.applyOp(op);
        }
        // Flush any pending image declared by the last image op without a trailing
        // paint call (mirrors end()'s flush; harmless if nothing is pending).
        this.flushPendingImage();

        if (pushedTransform) this.currentCanvas.restore();
        this.worldAlpha = prevWorldAlpha;
        if (pushedLayer) {
            this.currentCanvas.restore();
            groupFilter?.delete?.();
        }
    }

    /**
     * Size the union of a Graphics' shapes in a throwaway measurement pass and
     * return the centre of its bounding box — the default pivot for a
     * graphics-level rotation/scale. Builds the shape ops (skipping paint and
     * compositing ops) into a suspended-cache scope so the real paint pass that
     * follows is unaffected. Falls back to the local origin when there are no
     * path-backed shapes (e.g. text only).
     */
    private measureUnionCenter(graphics: Graphics): Vector2 {
        this.shapeHandler.beginMeasure();
        for (const op of graphics.ops()) {
            switch (op.kind) {
                case "rect": this.shapeHandler.rect(op.state); break;
                case "ellipse": this.shapeHandler.ellipse(op.state); break;
                case "path": this.shapeHandler.path(op.state); break;
                case "line": this.shapeHandler.line(op.state); break;
                case "polygon": this.shapeHandler.polygon(op.state); break;
                case "polygram": this.shapeHandler.polygram(op.state); break;
                // Paint/compositing/text/image ops don't change the union bbox used
                // for the pivot, so they're skipped during measurement.
            }
        }
        const bounds = this.shapeHandler.measureUnionBounds();
        this.shapeHandler.endMeasure();
        if (!bounds) return { x: 0, y: 0 };
        return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    }

    private applyOp(op: GraphicsOp): void {
        switch (op.kind) {
            case "rect": this._rect(op.state); break;
            case "ellipse": this._ellipse(op.state); break;
            case "path": this._path(op.state); break;
            case "line": this._line(op.state); break;
            case "polygon": this._polygon(op.state); break;
            case "polygram": this._polygram(op.state); break;
            case "text": this._text(op.state); break;
            case "richText": this._richText(op.state); break;
            case "image": this._image(op.state); break;
            case "fill": this._fill(op.fills); break;
            case "stroke": this._stroke(op.strokes); break;
            case "shadow": this._shadow(op.shadows); break;
            case "cut": this._cut(); break;
            case "mask": this._maskOp(op.options); break;
            case "applyMask": this._applyMask(); break;
            case "endMask": this._endMaskOp(); break;
        }
    }

    /**
     * Applies the node's transform to the canvas, then realises its opacity and
     * blend. A `pass-through` node (the default) is *not* isolated: its opacity
     * folds into {@link worldAlpha} (so the node's fills/strokes and its
     * descendants paint at the faded alpha while their blend modes still mix
     * against the backdrop). A non-pass-through `blend` *is* isolated: a
     * `saveLayer` carrying that blend mode and the node's opacity flattens the
     * node into a group that then blends against the backdrop as a unit.
     * Effects always need their own isolated buffer. Any pushed `saveLayer` is
     * tracked in {@link effectLayerStack} for `end()` to unwind.
     */
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
        const blend: NodeBlendMode = state.blend ?? 'pass-through';
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

        // Backdrop-flagged effects run on the backdrop layer (applyBackdropEffects),
        // not the node's own content — exclude them from the foreground filter chain.
        const foregroundEffects = effects.filter((e) => !("backdrop" in e && e.backdrop));
        let effectFilter: any = null;
        if (foregroundEffects.length > 0) {
            const w = this.surface.width();
            const h = this.surface.height();
            // Motion blur needs the node's live velocity, which static effect data
            // can't carry — resolve each `motionBlur` against the current node's
            // render state here, then hand the renderer a concrete directional
            // smear. Effects without motion blur skip the copy entirely.
            const resolved = this.resolveMotionBlurEffects(foregroundEffects);
            effectFilter = CanvasKitEffectRegistry.composeFilters(resolved, this.canvasKit, w, h);
        }

        const isolating = blend !== 'pass-through';
        if (isolating) {
            // Isolating blend: flatten this node (its own paint + descendants)
            // into a group, then composite back with the node's blend mode and
            // opacity (scaled by the inherited pass-through alpha). An effect
            // filter, when present, rides on the same layer. Descendants paint at
            // full alpha inside the group — the group's contribution is scaled on
            // composite-back — so reset worldAlpha to 1 for the layer's lifetime.
            this.layerPaint.setAlphaf(this.worldAlpha * (opacity < 1 ? opacity : 1));
            this.layerPaint.setBlendMode(getCanvasKitBlendMode(this.canvasKit, blend as any));
            this.layerPaint.setImageFilter(effectFilter ?? null);
            this.currentCanvas.saveLayer(this.layerPaint);
            this.layerPaint.setAlphaf(1);
            this.layerPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            this.layerPaint.setImageFilter(null);
            this.effectLayerStack[this.effectLayerStack.length - 1]++;
            this.worldAlpha = 1;
        } else {
            // Pass-through: fold opacity into the accumulated alpha (carried into
            // every paint) instead of isolating. Effects still need their own
            // buffer — push an effect-only layer (no opacity, that's in the
            // paints) when one is present.
            if (effectFilter != null) {
                this.layerPaint.setAlphaf(1);
                this.layerPaint.setImageFilter(effectFilter);
                this.currentCanvas.saveLayer(this.layerPaint);
                this.layerPaint.setImageFilter(null);
                this.effectLayerStack[this.effectLayerStack.length - 1]++;
            }
            if (opacity < 1) this.worldAlpha *= opacity;
        }

        return this;
    }

    /**
     * Replace any `motionBlur` effect with a `motionBlurResolved` smear computed
     * from the current node's sampled velocity (from {@link currentRenderState}).
     * Returns the input array unchanged when there is no motion blur (the common
     * case) so non-motion-blur transforms keep their zero-copy fast path. A
     * motion blur that resolves to nothing (static node / unknown velocity) is
     * dropped from the array.
     */
    private resolveMotionBlurEffects(effects: SceneEffect[]): SceneEffect[] {
        let hasMotionBlur = false;
        for (const e of effects) {
            if (e.type === "motionBlur") { hasMotionBlur = true; break; }
        }
        if (!hasMotionBlur) return effects;

        const rs = this.currentRenderState();
        const out: SceneEffect[] = [];
        for (const e of effects) {
            if (e.type !== "motionBlur") {
                out.push(e);
                continue;
            }
            const resolved = rs
                ? resolveMotionBlur(e as MotionBlurEffect, rs.velocity, rs.dt)
                : null;
            if (resolved) out.push(resolved as unknown as SceneEffect);
        }
        return out;
    }

    // Resolve the reference rect for a fill `space`, in the current node's local
    // space. `parent` is supplied by the node via begin(); `global` is the render
    // viewport mapped from device space through the inverse current matrix.
    private spaceRect(space: FillSpace): SpaceRect | null {
        if (space === "parent") {
            return this.currentSpaceRects().parent ?? null;
        }
        if (space === "global") {
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

    private _rect(state: Partial<RectState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.rect(state);
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
    }

    private _ellipse(state: Partial<EllipseState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.ellipse(state);
    }

    private _path(state: Partial<PathState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.path(state);
    }

    private _line(state: Partial<LineState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.line(state);
    }

    private _polygon(state: Partial<PolygonState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygon(state);
    }

    private _polygram(state: Partial<PolygramState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygram(state);
    }

    private _text(state: Partial<TextState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.text(state);
    }

    /** Lays out spans/runs and paints each run's fill/stroke immediately (rich text carries per-span paint, bypassing the usual fill/stroke ops). */
    private _richText(state: Partial<RichTextState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();

        const fullState = withRichTextDescriptor(state);
        const layout = layoutRichText(
            this.canvasKit,
            this.storageAdapter.getFontMgr(),
            fullState,
        );

        // Spans carry their own resolved fills/strokes, so we draw eagerly
        // here rather than going through the fill/stroke ops. Push the overall
        // bounds so any per-run gradient resolves against the whole rich-text
        // box, not just the run.
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
    }

    /** Defers drawing until a following fill/stroke/shadow op or the next shape op flushes via {@link flushPendingImage} — lets images share the same accumulation as other shapes. */
    private _image(state: Partial<ImageState>): void {
        this.flushPendingImage();
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.pendingImage = state;
        this.pendingImageShadows = [];
        this.pendingImageFills = [];
        this.pendingImageStrokes = [];
    }

    private _fill(fills: FillProp | FillProp[]): void {
        const resolved = resolveFillArray(fills);
        if (resolved.length === 0) return;
        // A fill following an image op styles that pending image, mirroring the
        // old image paint-context routing.
        if (this.pendingImage) {
            if (resolved.length > 0) this.pendingImageFills.push(...resolved);
            return;
        }
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('fill')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'fill', shapes: [...this.shapeHandler.shapes], fills: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const space = pendingShadows[0].fill[0]?.space ?? "local";
            const { shapes, dispose } = this.strokeShapesForSpace(space);
            // Outer shadows paint beneath the fill; inner shadows paint over it.
            this.strokeHandler.applyShadows(pendingShadows, shapes, resolved, [], this.applyFillSpaceBounds);
            this.fillHandler.applyFills(resolved, this.shapeHandler.shapes);
            this.strokeHandler.applyInnerShadows(pendingShadows, shapes, resolved, this.applyFillSpaceBounds);
            dispose();
        } else {
            this.fillHandler.applyFills(resolved, this.shapeHandler.shapes);
        }
        this.shapeHandler.paintApplied = true;
    }

    // Set the fill handler's bounds for a fill, honouring its `space`. Used as
    // the resolveBounds hook for stroke/shadow shaders.
    private applyFillSpaceBounds = (
        fill: FillResolved,
        shape: { ckPath?: any } | null,
    ): void => {
        this.fillHandler.setCurrentBounds(this.fillHandler.boundsForSpace(fill.space ?? "local", shape));
    };

    // Pick the shapes a stroke/shadow should be drawn over. The drawn shapes are
    // always treated as one unit, so stroke the union outline (overlapping shapes
    // then show no internal seams). Returns the shape list plus a disposer for
    // any transient union path. `space` is accepted for call-site symmetry with
    // the fill path but no longer changes the grouping.
    private strokeShapesForSpace(_space: FillSpace): {
        shapes: Array<{ draw: (p: any) => void; ckPath?: any; spreadPath?: (spread: number) => any }>;
        dispose: () => void;
    } {
        const union = this.shapeHandler.unionStrokeShape();
        if (union) {
            return { shapes: [union], dispose: () => union.ckPath?.delete() };
        }
        return { shapes: this.shapeHandler.shapes, dispose: () => { } };
    }

    private _stroke(strokes: StrokeProp | StrokeProp[]): void {
        const resolved = resolveStrokeArray(strokes);
        if (resolved.length === 0) return;
        // A stroke following an image op styles that pending image.
        if (this.pendingImage) {
            if (resolved.length > 0) this.pendingImageStrokes.push(...resolved);
            return;
        }
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('stroke')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'stroke', shapes: [...this.shapeHandler.shapes], strokes: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const shadowSpace = pendingShadows[0].fill[0]?.space ?? "local";
            const { shapes: shadowShapes, dispose: shadowDispose } = this.strokeShapesForSpace(shadowSpace);
            this.strokeHandler.applyShadows(pendingShadows, shadowShapes, [], resolved, this.applyFillSpaceBounds);
            shadowDispose();
        }
        // Strokes are always drawn over the union outline; each stroke's shader
        // bounds are resolved from its own fill space via applyFillSpaceBounds.
        const space = resolved[0].fill[0]?.space ?? "local";
        const { shapes, dispose } = this.strokeShapesForSpace(space);
        this.strokeHandler.applyStrokes(resolved, shapes, this.applyFillSpaceBounds);
        dispose();
        this.shapeHandler.paintApplied = true;
    }

    private _shadow(shadows: ShadowProp | ShadowProp[]): void {
        const resolved = resolveShadowArray(shadows);
        if (resolved.length === 0) return;
        // A shadow following an image op styles that pending image.
        if (this.pendingImage) {
            if (resolved.length > 0) this.pendingImageShadows.push(...resolved);
            return;
        }
        if (this.shapeHandler.isCollectingPaths()) return;
        this.shapeHandler.storePendingShadows(resolved);
    }

    private _cut(): void {
        this.shapeHandler.cut();
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

    beginClip(clip: Clip): void {
        if (!this.isRendering) {
            console.warn("beginClip() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        canvas.save();
        this.clipRestoreStack.push(1);

        const ops = clip.ops();
        // Fast path — a single shape with no cut clips natively (clipRect/clipRRect
        // for axis-aligned rects/ellipses), no combined path needed.
        if (ops.length === 1 && ops[0].kind !== "cut") {
            const shape = this.buildClipShapeOp(ops[0]);
            if (shape) {
                shape.clip(/* isolated= */ true);
                shape.deletePaths();
            }
            return;
        }

        // Compound clip: union the shapes (subtracting cuts) into one path and
        // clip to it. No-op when nothing built a path.
        const combined = this.combineClipPath(clip);
        if (combined) {
            canvas.clipPath(combined, this.canvasKit.ClipOp.Intersect, true);
            combined.delete();
        }
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

    /** Build the concrete shape instance for a single clip shape op. */
    private buildClipShapeOp(op: ClipOp): RectShape | EllipseShape | PolygonShape | PolygramShape | PathShape | LineShape | null {
        const ck = this.canvasKit;
        const canvas = () => this.currentCanvas;
        switch (op.kind) {
            case "rect": return new RectShape(ck, canvas, op.state);
            case "ellipse": return new EllipseShape(ck, canvas, op.state);
            case "polygon": return new PolygonShape(ck, canvas, op.state);
            case "polygram": return new PolygramShape(ck, canvas, op.state);
            case "path": return new PathShape(ck, canvas, op.state);
            case "line": return new LineShape(ck, canvas, op.state);
            case "cut": return null;
        }
    }

    /**
     * Replay a {@link Clip}'s ops into a single CanvasKit path: shapes union
     * together, and a `cut` subtracts the most-recently declared shape from the
     * shapes before it (mirroring `Graphics.cut()`). Returns a freshly-owned path
     * the caller must `delete()`, or `null` when no shape produced a path.
     */
    private combineClipPath(clip: Clip): CKPath | null {
        const ck = this.canvasKit;
        // Each entry is a path the caller (this method) owns; we fold them into one.
        const paths: CKPath[] = [];
        for (const op of clip.ops()) {
            if (op.kind === "cut") {
                // Subtract the last path from the union of the ones before it.
                const cutter = paths.pop();
                if (!cutter) continue;
                const base = this.unionPaths(paths.splice(0, paths.length));
                if (!base) { cutter.delete(); continue; }
                const diff = ck.Path.MakeFromOp(base, cutter, ck.PathOp.Difference);
                base.delete();
                cutter.delete();
                if (diff) paths.push(diff);
                continue;
            }
            const shape = this.buildClipShapeOp(op);
            if (!shape) continue;
            shape.ensurePath();
            // Copy out the path so deletePaths() doesn't free what we keep.
            if (shape.ckPath) paths.push(shape.ckPath.copy());
            shape.deletePaths();
        }
        return this.unionPaths(paths);
    }

    /** Union a list of owned paths into one, consuming the inputs. */
    private unionPaths(paths: CKPath[]): CKPath | null {
        const ck = this.canvasKit;
        if (paths.length === 0) return null;
        let combined = paths[0];
        for (let i = 1; i < paths.length; i++) {
            const next = ck.Path.MakeFromOp(combined, paths[i], ck.PathOp.Union);
            combined.delete();
            paths[i].delete();
            if (!next) {
                for (let j = i + 1; j < paths.length; j++) paths[j].delete();
                return null;
            }
            combined = next;
        }
        return combined;
    }

    // ─── Effect scope (filters + shader effects, foreground or backdrop) ─────────

    // One entry per open beginEffectScope/endEffectScope pair. `canvasRestores`
    // counts saveLayer()s pushed in begin (the backdrop filter layer) that end()
    // must pop. `captures` holds foreground offscreen captures (one per foreground
    // shader effect), resolved in end() inner-first so nested effects compose in
    // the same order the old separate begin/end pairs did.
    private effectScopeStack: Array<{
        canvasRestores: number;
        captures: ForegroundCapture[];
    }> = [];

    /**
     * Open an effect scope over the node (see {@link RenderContext.beginEffectScope}).
     * Effects are routed by the renderer, not the caller:
     *
     * - ImageFilter-composable effects (blur, grayscale, …) — only meaningful for
     *   the backdrop here (foreground filters ride the node's transform layer) —
     *   are composed into one filter and seeded into a backdrop saveLayer.
     * - Shader effects (bulge, magnify, posterize, backdrop SkSL) are dispatched to
     *   their {@link ShaderEffect} handler. Backdrop ones snapshot the surface and
     *   repaint warped in device space immediately; foreground ones redirect drawing
     *   into a per-effect offscreen surface that {@link endEffectScope} resamples.
     *
     * `width`/`height` are logical px (size-relative filters and shader lens boxes
     * scale them by the CTM as needed).
     */
    beginEffectScope(effects: SceneEffect[], target: EffectTarget, width: number, height: number): void {
        if (!this.isRendering) {
            console.warn("beginEffectScope() must be called within the draw() method.");
            return;
        }

        const entry: (typeof this.effectScopeStack)[number] = { canvasRestores: 0, captures: [] };

        // Split into shader effects (per-handler) and the ImageFilter-composable
        // remainder, preserving authoring order.
        const filterEffects: SceneEffect[] = [];
        const shaderEffects: Array<{ handler: ShaderEffect; effect: SceneEffect }> = [];
        for (const effect of effects) {
            const handler = ShaderEffectRegistry.resolve(effect, target);
            if (handler) shaderEffects.push({ handler, effect });
            else filterEffects.push(effect);
        }

        // Backdrop filter layer first (matches the old order: filters under the
        // shader passes). Foreground filters are handled by transform()/draw(), so
        // only run this for the backdrop.
        if (target === "backdrop" && filterEffects.length > 0) {
            if (this.openBackdropFilterLayer(filterEffects, width, height)) entry.canvasRestores++;
        }

        for (const { handler, effect } of shaderEffects) {
            if (target === "backdrop") {
                this.paintBackdropShaderEffect(handler, effect, width, height);
            } else {
                // Foreground: redirect drawing into an offscreen capture; resolved
                // (resampled through the lens) in endEffectScope.
                const capture = this.openForegroundCapture(handler, effect, width, height);
                if (capture) entry.captures.push(capture);
            }
        }

        this.effectScopeStack.push(entry);
    }

    endEffectScope(): void {
        if (!this.isRendering) {
            console.warn("endEffectScope() must be called within the draw() method.");
            return;
        }
        const entry = this.effectScopeStack.pop();
        if (!entry) return;

        // Resolve foreground captures inner-first (reverse of begin order) so a
        // capture's lens output redraws onto the next-outer capture's canvas,
        // composing exactly as the old nested begin/end pairs did.
        for (let i = entry.captures.length - 1; i >= 0; i--) {
            this.resolveForegroundCapture(entry.captures[i]);
        }
        for (let i = 0; i < entry.canvasRestores; i++) {
            this.currentCanvas.restore();
        }
    }

    /**
     * Compose `effects` into one ImageFilter and seed a backdrop saveLayer with the
     * current canvas content run through it, clipped to the active silhouette.
     * Returns `true` when a layer was pushed (so end() restores it).
     *
     * Per-effect handlers author filters in *logical* px, but a `saveLayer` backdrop
     * filter runs in *device* space, so the composed logical filter `F` is wrapped
     * `scale(pr) ∘ F ∘ scale(1/pr)` to behave as it would in the foreground.
     */
    private openBackdropFilterLayer(effects: SceneEffect[], width: number, height: number): boolean {
        const ck = this.canvasKit;
        const composed = CanvasKitEffectRegistry.composeFilters(effects, ck, width, height);
        if (composed == null) return false;
        const pr = this.pixelRatio;
        const linear = { filter: ck.FilterMode.Linear, mipmap: ck.MipmapMode.None };
        const toLogical = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.scaled(1 / pr, 1 / pr), linear, null);
        const inLogical = ck.ImageFilter.MakeCompose(composed, toLogical);
        const backdrop = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.scaled(pr, pr), linear, inLogical);
        // saveLayer with a backdrop filter seeds the new layer with the current
        // canvas content run through `backdrop`. Clamp tiling samples beyond the
        // active clip so the filter doesn't darken toward the silhouette edge; the
        // layer is bounded by the active clip, so only the silhouette composites
        // back on restore.
        this.currentCanvas.saveLayer(undefined, null, backdrop, undefined, ck.TileMode.Clamp);
        backdrop.delete();
        inLogical.delete();
        toLogical.delete();
        composed.delete();
        return true;
    }

    /**
     * Snapshot the backdrop (the content beneath the node), build the handler's
     * lens shader from it, and repaint it warped in device space — confined to the
     * active silhouette clip. Used for magnify, backdrop posterize, backdrop SkSL.
     */
    private paintBackdropShaderEffect(
        handler: ShaderEffect,
        effect: SceneEffect,
        width: number,
        height: number,
    ): void {
        const ck = this.canvasKit;
        if (width <= 0 || height <= 0) return;

        // The node is already translated to its centre, so the CTM maps local
        // origin → device centre and its scale converts logical size to device px.
        const m = this.currentCanvas.getTotalMatrix();
        // A backdrop snapshot fully covers the surface, so it always samples with
        // Clamp regardless of the handler's foreground tile preference.
        const snapshot = this.surface.makeImageSnapshot();
        const content = snapshot.makeShaderOptions(
            ck.TileMode.Clamp, ck.TileMode.Clamp, filterMode(ck, handler.filterMode), ck.MipmapMode.None,
        );
        const lens = handler.makeShader(effect, ck, content, this.shaderGeometry(m, width, height));
        if (lens == null) {
            content.delete();
            snapshot.delete();
            return;
        }
        this.paintShaderInDeviceSpace(lens, m);
        lens.delete();
        content.delete();
        snapshot.delete();
    }

    /**
     * Redirect drawing into a fresh offscreen surface so the node's own content can
     * later be resampled through the handler's lens, leaving the backdrop untouched.
     * Returns the capture (resolved in {@link resolveForegroundCapture}) or `null`
     * when the offscreen couldn't be created (drawing then stays on the main canvas).
     */
    private openForegroundCapture(
        handler: ShaderEffect,
        effect: SceneEffect,
        width: number,
        height: number,
    ): ForegroundCapture | null {
        const ck = this.canvasKit;
        if (width <= 0 || height <= 0) return null;

        const offscreen = this.surface.makeSurface(this.surface.imageInfo());
        if (!offscreen) return null;

        const m = this.currentCanvas.getTotalMatrix();
        const offCanvas = offscreen.getCanvas();
        offCanvas.save();
        offCanvas.clear(ck.TRANSPARENT);
        offCanvas.concat(m); // replicate the full CTM so the node draws at the same device coords

        const savedCanvas = this.currentCanvas;
        this.currentCanvas = offCanvas;
        return { handler, effect, width, height, savedCanvas, offscreen, matrix: m };
    }

    /**
     * Stop capturing into an offscreen, snapshot what the node drew, and repaint it
     * through the handler's lens onto the canvas active when the capture opened.
     */
    private resolveForegroundCapture(capture: ForegroundCapture): void {
        const ck = this.canvasKit;
        const { handler, effect, width, height, savedCanvas, offscreen, matrix: m } = capture;

        // Balance the save() from openForegroundCapture and resume the outer canvas.
        this.currentCanvas.restore();
        this.currentCanvas = savedCanvas;

        const snapshot = offscreen.makeImageSnapshot();
        const tm = tileMode(ck, handler.tileMode);
        const content = snapshot.makeShaderOptions(
            tm, tm, filterMode(ck, handler.filterMode), ck.MipmapMode.None,
        );
        const lens = handler.makeShader(effect, ck, content, this.shaderGeometry(m, width, height));
        if (lens == null) {
            content.delete();
            snapshot.delete();
            offscreen.delete();
            return;
        }
        this.paintShaderInDeviceSpace(lens, m);
        lens.delete();
        content.delete();
        snapshot.delete();
        offscreen.delete();
    }

    /** Node box in device px: centre from the CTM translation, size from its scale. */
    private shaderGeometry(m: number[], width: number, height: number): ShaderEffectGeometry {
        const sx = Math.hypot(m[0], m[3]);
        const sy = Math.hypot(m[1], m[4]);
        return { centerX: m[2], centerY: m[5], width: width * sx, height: height * sy };
    }

    /**
     * Paint `shader` over the whole surface in device space (identity CTM, so the
     * shader's fragCoord == device px), confined to the active silhouette clip
     * (stored in device space, so it survives the matrix reset). CanvasKit has no
     * resetMatrix, so concat the inverse CTM to reach identity.
     */
    private paintShaderInDeviceSpace(shader: Shader, m: number[]): void {
        const ck = this.canvasKit;
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
        this.currentCanvas.restore();
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

    endBoolean(): void {
        if (!this.isRendering) {
            console.warn("endBoolean() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.endBoolean();
    }

    // ─── Mask group ──────────────────────────────────────────────────────────

    beginMask(options?: MaskOptions): void {
        if (!this.isRendering) {
            console.warn("beginMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.beginMask(options);
        this.deferredPaintsStack.push([]);
    }

    applyMask(): void {
        if (!this.isRendering) {
            console.warn("applyMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.applyMask();
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

    // Graphics-op variants of the mask scope, used when a Graphics command list
    // opens an inline mask within a single draw(). They share the imperative
    // scope implementation above.
    private _maskOp(options?: MaskOptions): void {
        this.beginMask(options);
    }
    private _applyMask(): void {
        this.applyMask();
    }
    private _endMaskOp(): void {
        this.endMask();
    }

    /** Replays fill/stroke calls that were postponed by an active mask scope (see `beginMask`/`_fill`/`_stroke`), in original order, once the mask resolves at `endMask`. */
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
                if (d.shadows) {
                    this.strokeHandler.applyInnerShadows(d.shadows, d.shapes, d.fills, this.applyFillSpaceBounds);
                }
            }
        }
    }
}
