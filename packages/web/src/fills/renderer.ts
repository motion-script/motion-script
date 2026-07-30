import type { CanvasKit, Image as CKImage, Paint } from "@motion-script/canvaskit";
import type { FillResolved, RasterizedSurface, SurfaceSource3D } from "@motion-script/core";
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
    /**
     * The node currently being painted. Note a *masked* child's fill is deferred
     * and replayed at the mask owner's `endMask`, so this is the mask owner's id
     * in that case — consistent within a frame, which is all a cache key needs.
     */
    nodeId: string;
    /**
     * How long the node being painted has existed, in seconds
     * (`NodeRenderState.elapsed`). Time-based fills resolve themselves against
     * it as they paint — a video fill derives the source timestamp to show from
     * it — so playback follows from *when the node appeared* and needs nothing
     * advancing it per frame. Same deferred-mask caveat as {@link nodeId}.
     */
    elapsed: number;
    /**
     * Scale factor from the live canvas matrix — pixel ratio, parent scale and
     * camera zoom folded together. A **function** because reading the matrix
     * allocates in wasm and almost no fill needs it.
     */
    getDeviceScale: () => number;
    /**
     * A stable per-node index for this fill within the current frame, keyed by
     * the resolved fill's *object identity*. Renderers that own external
     * per-instance resources (a 3D scene graph, a GPU texture) key them by
     * `${nodeId}#${paintSlot(fill)}` so two of the same fill type on one node
     * don't collide.
     */
    paintSlot: (fill: FillResolved) => number;
    /**
     * Scratch handed from {@link FillRenderer.preflight} to
     * {@link FillRenderer.applyPaint}, keyed by the resolved fill. Cleared per
     * `applyFills` call.
     */
    preflighted: Map<FillResolved, unknown>;
    /**
     * Rasterize a 2D source (a built `Graphics`, or a detached `Node` subtree)
     * into an offscreen buffer of `width`×`height` logical px.
     *
     * Only safe from {@link FillRenderer.preflight} — it re-enters the render
     * context, which resets the shared paint.
     */
    rasterizeSurface: (
        source: SurfaceSource3D,
        width: number,
        height: number,
        pixelRatio: number,
    ) => RasterizedSurface | null;
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
    /**
     * Configure `ctx.paint` for this fill and return true, or return false to be
     * skipped.
     *
     * **Must not draw**, beyond `ctx.drawShape`. The paint is shared across every
     * fill in the array, and anything that re-enters the render context (an
     * offscreen rasterize, a nested `draw`) resets its alpha, blend mode and
     * shader — silently stripping the opacity and blend of the fill being
     * configured. Do that work in {@link preflight} instead.
     */
    abstract applyPaint(fill: T, ctx: FillRendererContext): boolean;

    /**
     * Optional pass run over every fill *before* the paint is configured, so a
     * renderer needing offscreen work (rendering a 3D scene, rasterizing a
     * texture) can do it without clobbering the shared paint. Stash the result in
     * `ctx.preflighted` for {@link applyPaint} to pick up.
     *
     * Not run for shadow silhouettes, which paint from inside a `saveLayer` —
     * a renderer that depends on preflight simply doesn't paint there.
     */
    preflight?(fill: T, ctx: FillRendererContext): void;

    /** Release any persistent CanvasKit objects held by this renderer. */
    dispose(): void { }
}
