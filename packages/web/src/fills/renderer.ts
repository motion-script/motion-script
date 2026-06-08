import type { CanvasKit, Image as CKImage, Paint } from "@motion-script/canvaskit";
import type { FillResolved } from "@motion-script/core";
import type { WebStorageAdapter } from "../storage-adapter";
import type { ShapeBounds } from "./handler";

export interface FillRendererContext {
    canvasKit: CanvasKit;
    paint: Paint;
    assets: WebStorageAdapter;
    getShapeBounds: () => ShapeBounds | null;
    offscreenCanvas: HTMLCanvasElement | null;
    offscreenCtx: CanvasRenderingContext2D | null;
    /**
     * CKImages the renderer materialized for this fill. The handler deletes
     * them after the fill's shapes are drawn so GPU memory is bounded to one
     * frame's worth of textures rather than the whole cached clip.
     */
    transientImages: CKImage[];
}

export abstract class FillRenderer<T extends FillResolved = FillResolved> {
    abstract applyPaint(fill: T, ctx: FillRendererContext): boolean;

    /** Release any persistent CanvasKit objects held by this renderer. */
    dispose(): void { }
}
