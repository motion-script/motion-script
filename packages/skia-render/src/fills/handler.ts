import type {
    CanvasKit,
    Paint,
} from "@motion-script/canvaskit";
import {
    type BlendMode,
    type FillResolved,
    type FillSpace,
} from "@motion-script/core";
import type { SkiaAssets } from "../assets";
import type { FillRendererContext } from "./renderer";
import { FillRenderRegistry } from "./registry";
import { getCanvasKitBlendMode } from "../blend";

export type { FillRenderer } from "./renderer";
export type { FillRendererContext } from "./renderer";
export { FillRenderRegistry } from "./registry";
export interface ShapeBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface DrawnShape {
    draw: (paint: Paint) => void;
    getBounds?: () => ShapeBounds | null;
}

/**
 * Stateless paint applicator. All async work (decoding images, extracting
 * video frames) happens in WebStorageAdapter before render. By the time
 * applyFills runs, every required CKImage is already cached.
 */
export class FillHandler {
    private canvasKit: CanvasKit;
    private getPaint: () => Paint;
    private getCanvas: () => import("@motion-script/canvaskit").Canvas;
    private getUnionBounds: () => ShapeBounds | null;
    private getSpaceRect: (space: FillSpace) => ShapeBounds | null;
    private assets: SkiaAssets;
    // Accumulated pass-through alpha to fold into every fill (set by the owning
    // RenderContext2D as pass-through nodes fade). Defaults to 1.
    private getWorldAlpha: () => number;
    private getNodeId: () => string;
    private getElapsed: () => number;
    private getDeviceScale: () => number;
    private rasterizeSurface: FillRendererContext["rasterizeSurface"];
    private effectResources: FillRendererContext["effectResources"];

    /**
     * Per-frame paint slots: node id → resolved fill → index.
     *
     * Keyed by the fill object's *identity*, not by paint order, because one
     * frame hands the very same `FillResolved` to the shadow pass, the fill pass
     * and the inner-shadow pass — a counter would treat those as three different
     * fills and, for a 3D fill, render the scene three times. Identity also keeps
     * a slot stable across frames for any fixed scene structure, since the
     * first-appearance order doesn't shift when unrelated layers come and go.
     */
    private slots = new Map<string, Map<FillResolved, number>>();

    // The bounds the next gradient/image shader should resolve against. Set per
    // fill/shape by applyFills before each applyPaint, so the no-arg
    // getShapeBounds() handed to renderers stays simple.
    private currentBounds: ShapeBounds | null = null;

    constructor(
        canvasKit: CanvasKit,
        getPaint: () => Paint,
        getCanvas: () => import("@motion-script/canvaskit").Canvas,
        getUnionBounds: () => ShapeBounds | null,
        getSpaceRect: (space: FillSpace) => ShapeBounds | null,
        assets: SkiaAssets,
        getWorldAlpha: () => number = () => 1,
        getNodeId: () => string = () => "",
        getElapsed: () => number = () => 0,
        getDeviceScale: () => number = () => 1,
        rasterizeSurface: FillRendererContext["rasterizeSurface"] = () => null,
        effectResources: FillRendererContext["effectResources"] = () => null,
    ) {
        this.canvasKit = canvasKit;
        this.getPaint = getPaint;
        this.getCanvas = getCanvas;
        this.getUnionBounds = getUnionBounds;
        this.getSpaceRect = getSpaceRect;
        this.assets = assets;
        this.getWorldAlpha = getWorldAlpha;
        this.getNodeId = getNodeId;
        this.getElapsed = getElapsed;
        this.getDeviceScale = getDeviceScale;
        this.rasterizeSurface = rasterizeSurface;
        this.effectResources = effectResources;
        this.currentBounds = null;
    }

    /** Pass-through alpha to multiply into a paint's own opacity. */
    worldAlpha(): number {
        return this.getWorldAlpha();
    }

    /**
     * Drop the frame's paint slots. Called once per render pass, alongside the 3D
     * backend's own frame bracket.
     *
     * Deliberately *not* called from `rasterize`: a fill painted inside a
     * rasterized buffer must get a slot distinct from one on the main canvas, and
     * letting the counter run through the nested pass gives that for free.
     */
    beginFrame(): void {
        this.slots.clear();
    }

    /** See {@link slots}. */
    private paintSlot(fill: FillResolved): number {
        const nodeId = this.getNodeId();
        let perNode = this.slots.get(nodeId);
        if (!perNode) {
            perNode = new Map();
            this.slots.set(nodeId, perNode);
        }
        const existing = perNode.get(fill);
        if (existing !== undefined) return existing;
        const slot = perNode.size;
        perNode.set(fill, slot);
        return slot;
    }

    // Union the shapes' paths into one, so a single fill (and its opacity)
    // covers the combined silhouette. Returns null for fewer than two path
    // shapes (the caller's per-shape draw is equivalent and cheaper) or when any
    // shape has no ckPath (text). Caller owns and must delete() the result.
    private unionPath(
        shapes: Array<{ ckPath?: any }>,
    ): import("@motion-script/canvaskit").Path | null {
        if (shapes.length < 2 || shapes.some(s => !s.ckPath)) return null;
        let combined = shapes[0].ckPath.copy();
        for (let i = 1; i < shapes.length; i++) {
            const next = this.canvasKit.Path.MakeFromOp(
                combined, shapes[i].ckPath, this.canvasKit.PathOp.Union,
            );
            combined.delete();
            if (!next) return null;
            combined = next;
        }
        return combined;
    }

    // Set the bounds the next applyPaint's shader resolves against. Used by the
    // stroke/shadow handlers, which call FillRenderRegistry.applyPaint directly.
    setCurrentBounds(bounds: ShapeBounds | null): void {
        this.currentBounds = bounds;
    }

    // Bounds for a fill, given its space. The drawn shapes are always painted as
    // one unit, so every space resolves against a single rect:
    //   local  → the shape's own (union) bounds — pinned to the figure.
    //   parent → the parent node's layout rect.
    //   global → the render viewport.
    // parent/global fall back to the union bounds when no reference rect exists.
    boundsForSpace(
        space: FillSpace,
        _shape: { ckPath?: { getBounds(): Float32Array } } | null,
    ): ShapeBounds | null {
        switch (space) {
            case "parent":
            case "global":
                return this.getSpaceRect(space) ?? this.getUnionBounds();
            case "local":
            default:
                return this.getUnionBounds();
        }
    }

    /**
     * Nothing to release: the handler owns no CanvasKit objects of its own (the
     * paint and canvas belong to the render context, and per-fill
     * `transientImages` are freed inside `applyFills`). Kept because
     * `RenderContext2D.dispose()` calls it and a handler that later acquires its own
     * resources should already have the hook.
     *
     * Deliberately does *not* call `FillRenderRegistry.disposeRenderers()`: that
     * registry is static and shared by every live render context, so freeing its
     * renderers' caches here would pull shaders out from under a second context
     * (the player's, while an export's context is torn down).
     */
    dispose(): void { }

    getCanvasKitBlendMode(blend: BlendMode): any {
        return getCanvasKitBlendMode(this.canvasKit, blend);
    }

    // `worldAlpha` defaults to the accumulated pass-through alpha so solid fills
    // fold it into their color. Callers that realise opacity another way (e.g.
    // the shadow path composites its silhouette through an alpha'd saveLayer)
    // pass 1 to avoid double-applying it.
    buildRendererCtx(paint: Paint, worldAlpha: number = this.getWorldAlpha()): FillRendererContext {
        return {
            canvasKit: this.canvasKit,
            paint,
            assets: this.assets,
            worldAlpha,
            // Renderers read this once per applyPaint; applyFills sets
            // currentBounds to the right space's rect just before each call.
            getShapeBounds: () => this.currentBounds,
            nodeId: this.getNodeId(),
            elapsed: this.getElapsed(),
            getDeviceScale: this.getDeviceScale,
            paintSlot: (fill) => this.paintSlot(fill),
            rasterizeSurface: this.rasterizeSurface,
            effectResources: this.effectResources,
            preflighted: new Map(),
            transientImages: [],
            transientPaintObjects: [],
            clipFilterToShape: false,
            // Replaced per applyFills() call with a closure over the current shapes.
            drawShape: () => { },
            skipDefaultDraw: false,
        };
    }

    /** Results carried from {@link preflight} to each renderer's `applyPaint`. */
    private preflighted = new Map<FillResolved, unknown>();

    /**
     * Run every fill's optional pre-paint pass, before the shared paint is
     * configured — see {@link FillRenderer.preflight}.
     *
     * The bounds are set per fill exactly as the paint loop does, because a
     * renderer sizing an offscreen buffer needs the same rect it will later shade.
     */
    private preflight(fills: FillResolved[], paint: Paint): void {
        this.preflighted.clear();
        const ctx = this.buildRendererCtx(paint);
        ctx.preflighted = this.preflighted;
        for (const fill of fills) {
            this.currentBounds = this.boundsForSpace(fill.space ?? "local", null);
            FillRenderRegistry.preflight(fill, ctx);
        }
        this.currentBounds = null;
    }

    /**
     * Paint `shapes` as one figure with `paint`. Draws their union as a single
     * path so opacity < 1 composites once (drawing each shape separately would
     * double the alpha where they overlap and show a seam); falls back to a
     * per-shape draw when no union path is available.
     *
     * `clipToShape` confines the draw to the figure's own outline. Needed when
     * the paint carries an image filter: Skia rasterizes the geometry, runs the
     * filter over it and composites the *filtered* result, which is no longer
     * bounded by the path — so a pixelated or bloomed fill spills past the shape
     * it belongs to. A fill exists only inside its shape, so it is clipped back.
     * (A shader-based filter needs nothing: it is evaluated per covered pixel.)
     */
    private drawShapes(
        paint: Paint,
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: any }>,
        clipToShape = false,
    ): void {
        const unionPath = this.unionPath(shapes);
        const draw = () => {
            if (unionPath) this.getCanvas().drawPath(unionPath, paint);
            else for (const shape of shapes) shape.draw(paint);
        };

        // With several shapes and no union path there is nothing single to clip
        // to; such a fill keeps the unclipped behaviour rather than being drawn
        // once per shape (which would double alpha in the overlaps).
        const clip = clipToShape ? (unionPath ?? (shapes.length === 1 ? shapes[0].ckPath : null)) : null;
        if (clip) {
            const canvas = this.getCanvas();
            canvas.save();
            canvas.clipPath(clip, this.canvasKit.ClipOp.Intersect, true);
            draw();
            canvas.restore();
        } else {
            draw();
        }
        unionPath?.delete();
    }

    applyFills(fills: FillResolved[], shapes: Array<{ draw: (p: Paint) => void; ckPath?: any }>): boolean {
        if (fills.length === 0) return false;

        const paint = this.getPaint();

        // Offscreen work happens here, before the paint is configured. Anything
        // that re-enters the render context resets the shared paint's alpha,
        // blend and shader, so a renderer doing it from applyPaint would silently
        // strip the very fill it was configuring.
        this.preflight(fills, paint);

        paint.setStyle(this.canvasKit.PaintStyle.Fill);

        const rendererCtx = this.buildRendererCtx(paint);
        rendererCtx.preflighted = this.preflighted;
        // Lets a renderer redraw the figure for extra passes (e.g. Echo's trail).
        rendererCtx.drawShape = (p: Paint) => this.drawShapes(p, shapes, rendererCtx.clipFilterToShape);
        const worldAlpha = this.getWorldAlpha();

        for (const fill of fills) {
            const opacity = (fill.opacity !== undefined ? fill.opacity : 1.0) * worldAlpha;
            const space: FillSpace = fill.space ?? "local";

            // The shapes are always painted as one unit; the space only picks the
            // rect the shader resolves against (the figure's own bounds, the
            // parent rect, or the viewport).
            const bounds = this.boundsForSpace(space, null);

            paint.setAlphaf(opacity);
            if (fill.blend) {
                paint.setBlendMode(this.getCanvasKitBlendMode(fill.blend));
            } else {
                paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            }
            paint.setImageFilter(null);

            this.currentBounds = bounds;
            rendererCtx.skipDefaultDraw = false;
            rendererCtx.clipFilterToShape = false;
            if (!FillRenderRegistry.applyPaint(fill, rendererCtx)) continue;

            // A renderer (e.g. Echo) may have drawn the figure itself; otherwise
            // perform the default single pass with the prepared paint.
            if (!rendererCtx.skipDefaultDraw) this.drawShapes(paint, shapes, rendererCtx.clipFilterToShape);

            // Clear shader before deleting backing images so the paint stops
            // referencing them.
            paint.setShader(null);
            paint.setImageFilter(null);
            for (const img of rendererCtx.transientImages) img.delete();
            rendererCtx.transientImages.length = 0;
            for (const obj of rendererCtx.transientPaintObjects) obj.delete();
            rendererCtx.transientPaintObjects.length = 0;
        }

        this.currentBounds = null;
        paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1.0);
        paint.setShader(null);
        paint.setImageFilter(null);
        return true;
    }
}
