import type {
    CanvasKit,
    Paint,
} from "@motion-script/canvaskit";
import {
    type BlendMode,
    type FillResolved,
    type FillSpace,
} from "@motion-script/core";
import type { WebStorageAdapter } from "../storage-adapter";
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
    offscreenCanvas: HTMLCanvasElement | null = null;
    offscreenCtx: CanvasRenderingContext2D | null = null;

    private canvasKit: CanvasKit;
    private getPaint: () => Paint;
    private getCanvas: () => import("@motion-script/canvaskit").Canvas;
    private getUnionBounds: () => ShapeBounds | null;
    private getSpaceRect: (space: FillSpace) => ShapeBounds | null;
    private assets: WebStorageAdapter;
    // Accumulated pass-through alpha to fold into every fill (set by the owning
    // RenderContext as pass-through nodes fade). Defaults to 1.
    private getWorldAlpha: () => number;

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
        assets: WebStorageAdapter,
        getWorldAlpha: () => number = () => 1,
    ) {
        this.canvasKit = canvasKit;
        this.getPaint = getPaint;
        this.getCanvas = getCanvas;
        this.getUnionBounds = getUnionBounds;
        this.getSpaceRect = getSpaceRect;
        this.assets = assets;
        this.getWorldAlpha = getWorldAlpha;
        this.currentBounds = null;
    }

    /** Pass-through alpha to multiply into a paint's own opacity. */
    worldAlpha(): number {
        return this.getWorldAlpha();
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

    // Bounds for a fill, given its space and (for 'local') the shape being
    // painted. local → that shape; global → union of all shapes; parent/view →
    // the reference rect supplied by the render context.
    boundsForSpace(
        space: FillSpace,
        shape: { ckPath?: { getBounds(): Float32Array } } | null,
    ): ShapeBounds | null {
        switch (space) {
            case "local": {
                const b = shape?.ckPath?.getBounds();
                if (!b) return this.getUnionBounds();
                return { left: b[0], top: b[1], right: b[2], bottom: b[3] };
            }
            case "parent":
            case "view":
                return this.getSpaceRect(space) ?? this.getUnionBounds();
            case "global":
            default:
                return this.getUnionBounds();
        }
    }

    dispose(): void {
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
    }

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
            offscreenCanvas: this.offscreenCanvas,
            offscreenCtx: this.offscreenCtx,
            transientImages: [],
        };
    }

    applyFills(fills: FillResolved[], shapes: Array<{ draw: (p: Paint) => void; ckPath?: any }>): boolean {
        if (fills.length === 0) return false;

        const paint = this.getPaint();
        paint.setStyle(this.canvasKit.PaintStyle.Fill);

        const rendererCtx = this.buildRendererCtx(paint);
        const worldAlpha = this.getWorldAlpha();

        for (const fill of fills) {
            const opacity = (fill.opacity !== undefined ? fill.opacity : 1.0) * worldAlpha;
            const space: FillSpace = fill.space ?? "global";

            // For 'local', each shape gets its own shader resolved against its
            // own bounds. For every other space the shader is built once against
            // a shared rect and all shapes paint through it as one unit.
            const groups: Array<{
                bounds: ShapeBounds | null;
                shapes: Array<{ draw: (p: Paint) => void; ckPath?: any }>;
            }> = space === "local"
                ? shapes.map(s => ({ bounds: this.boundsForSpace("local", s), shapes: [s] }))
                : [{ bounds: this.boundsForSpace(space, null), shapes }];

            for (const group of groups) {
                paint.setAlphaf(opacity);
                if (fill.blend) {
                    paint.setBlendMode(this.getCanvasKitBlendMode(fill.blend));
                } else {
                    paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
                }
                paint.setImageFilter(null);

                this.currentBounds = group.bounds;
                if (!FillRenderRegistry.applyPaint(fill, rendererCtx)) continue;

                // Sync back mutable fields written by renderers
                this.offscreenCanvas = rendererCtx.offscreenCanvas;
                this.offscreenCtx = rendererCtx.offscreenCtx;

                // For a unified space (global/parent/view) with multiple shapes,
                // draw their union as one path so opacity < 1 composites once —
                // drawing each shape separately would double the alpha where they
                // overlap and show a seam. 'local' keeps shapes independent.
                const unionPath = space !== "local"
                    ? this.unionPath(group.shapes)
                    : null;
                if (unionPath) {
                    this.getCanvas().drawPath(unionPath, paint);
                    unionPath.delete();
                } else {
                    for (const shape of group.shapes) {
                        shape.draw(paint);
                    }
                }

                // Clear shader before deleting backing images so the paint stops
                // referencing them.
                paint.setShader(null);
                for (const img of rendererCtx.transientImages) img.delete();
                rendererCtx.transientImages.length = 0;
            }
        }

        this.currentBounds = null;
        paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1.0);
        paint.setShader(null);
        paint.setImageFilter(null);
        return true;
    }
}
