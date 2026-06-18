import type { CanvasKit, Image as CKImage, Paint } from "@motion-script/canvaskit";
import type { FillResolved } from "@motion-script/core";
import type { WebStorageAdapter } from "../storage-adapter";
import type { ShapeBounds } from "./handler";

export interface FillRendererContext {
    canvasKit: CanvasKit;
    paint: Paint;
    assets: WebStorageAdapter;
    /**
     * Accumulated pass-through (node/group) alpha to fold into the fill. The
     * handler sets it on the paint via `setAlphaf` for shader-based fills, but a
     * solid fill writes the whole RGBA via `setColorComponents` and would
     * otherwise clobber that alpha — so the solid renderer multiplies it back in
     * here. Defaults to 1.
     */
    worldAlpha: number;
    getShapeBounds: () => ShapeBounds | null;
    offscreenCanvas: HTMLCanvasElement | null;
    offscreenCtx: CanvasRenderingContext2D | null;
    /**
     * CKImages the renderer materialized for this fill. The handler deletes
     * them after the fill's shapes are drawn so GPU memory is bounded to one
     * frame's worth of textures rather than the whole cached clip.
     */
    transientImages: CKImage[];
    /**
     * Paints the current shape geometry (the same union/per-shape draw the
     * handler performs for the main pass) with the given paint. Lets a renderer
     * that needs extra passes — e.g. the video Echo filter drawing the current
     * frame plus its trailing past frames — draw the figure itself.
     */
    drawShape: (paint: Paint) => void;
    /**
     * Set by a renderer that has already drawn the figure itself (e.g. the Echo
     * filter draws the whole frame stack), telling the handler to skip its own
     * default draw pass. The handler still clears the shader and frees
     * `transientImages` afterward. Reset to false before each fill.
     */
    skipDefaultDraw: boolean;
}

export abstract class FillRenderer<T extends FillResolved = FillResolved> {
    abstract applyPaint(fill: T, ctx: FillRendererContext): boolean;

    /** Release any persistent CanvasKit objects held by this renderer. */
    dispose(): void { }
}
