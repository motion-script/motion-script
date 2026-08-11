import { RenderContext } from "./render-context";
import { Graphics } from "./graphics";
import { Clip } from "./clip";
import { TransformState } from "./descriptors/transform";
import { AssetTracker } from "@/assets/tracker";
import { prepareFill, resolveFillArray } from "@/attributes/shape/fill/registry";
import { prepareEffect } from "@/attributes/shape/effects/registry";
import type { SceneEffect } from "@/attributes/shape/effects/union";
import { FillResolved } from "@/attributes/shape/fill/union";
import { resolveStrokeArray } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray } from "@/attributes/shape/shadow/resolver";
import { BooleanOperation } from "@/attributes/mask/boolean";
import { MaskOptions } from "@/attributes/mask/mask";
import { Vector2 } from "@/attributes/layout/vector2";
import { forEachTexture3D } from "@/render3d/walk";
import { isSurfaceTexture3D, resolveSurfaceSource } from "@/render3d/texture";
import type { Graphics3D } from "@/render3d/graphics3d";

/** Recursion cap for a surface source that itself paints a 3D fill. */
const MAX_SURFACE_DEPTH = 4;

/**
 * A `RenderContext` that never draws anything — it walks the same `Graphics`
 * command lists a node's real `render()` already builds and registers any
 * image/video fill (and any font used by a raw `text`/`richText` shape op)
 * into an `AssetTracker`, instead of rasterizing.
 *
 * This is what lets asset discovery for images/video/paint be inferred
 * automatically rather than hand-declared in a `prepareRender` override: the
 * precomp pass calls `scene.render(trackRenderContext)` in place of a
 * dedicated declaration step (see `Precomp.precompScene`), and every node's
 * existing `renderSelf`/`renderOverlay`/`renderStroke` — built from the exact
 * same `Graphics`/fill objects used for real painting — drives this for free.
 *
 * Sizing: unlike the old hand-written `prepareRender` (which always sized
 * requests off the node's `layoutRect`), this derives width/height from the
 * most recently declared shape op in the same `draw()` call — the shape a
 * fill/stroke/shadow op actually paints. In every built-in node this
 * coincides with `layoutRect` (`Image`/`Video`/`ShapeNode` all build their
 * shape from it), and it's a better match for custom nodes that intentionally
 * size a fill differently from their own layout box (e.g. a chart bar sized
 * to its bar rect, not the chart's outer bounds). `path`/`line` descriptors
 * default width/height to 0 (a path's extent isn't implied by its command
 * list), so a node painting an image/video fill on a raw path/line needs to
 * pass explicit `width`/`height` for it to size correctly — e.g. a donut
 * chart slice would do `PathBuilder.toPathState({ width, height, centerBounds })`.
 */
export class TrackRenderContext extends RenderContext {
    /**
     * Asset discovery never resolves a `space:'parent'` fill against its reference
     * rect — it only needs to know *which* asset a fill names. Declaring that lets
     * every node skip computing those rects during the precomp pass.
     */
    override readonly readsSpaceRects = false;

    constructor(private readonly tracker: AssetTracker) {
        super();
    }

    private currentWidth = 0;
    private currentHeight = 0;
    private surfaceDepth = 0;
    /** Deduped per `draw()`, so one source on several materials replays once. */
    private readonly seenSurfaces = new Set<object>();

    private trackFont(fontFamily: string | undefined, fontWeight: number | string | undefined): void {
        if (!fontFamily) return;
        this.tracker.requestFont(fontFamily, String(fontWeight ?? 400));
    }

    private trackFills(fills: readonly FillResolved[] | undefined): void {
        if (!fills) return;
        for (const fill of fills) {
            prepareFill(fill, this.tracker, this.currentWidth, this.currentHeight);
            if (fill.type === "view3D") this.trackSurfaceSources(fill.graphics3D);
        }
    }

    /**
     * Walk into a 3D scene's `Tex.surface` sources.
     *
     * `prepareFill` covers the scene's *own* assets, but a surface source is 2D
     * content one level down — a `Graphics` with a `text` op, or a node subtree
     * with a webfont — and its assets are only discoverable by replaying it.
     * Nothing else can do this: `FillData.prepare` receives an `AssetTracker`, not
     * a render context, and this class is both the op walker and the only caller
     * of `prepareFill`.
     *
     * Bounded by {@link MAX_SURFACE_DEPTH}, since a surface can itself hold a 3D
     * fill holding that same surface.
     */
    private trackSurfaceSources(g3: Graphics3D): void {
        if (this.surfaceDepth >= MAX_SURFACE_DEPTH) return;

        forEachTexture3D(g3, (texture) => {
            if (!isSurfaceTexture3D(texture)) return;
            if (this.seenSurfaces.has(texture)) return;
            this.seenSurfaces.add(texture);

            const priorWidth = this.currentWidth;
            const priorHeight = this.currentHeight;
            // Size requests against the buffer, not the shape the 3D paints into.
            this.currentWidth = texture.width;
            this.currentHeight = texture.height;
            this.surfaceDepth++;
            try {
                const source = resolveSurfaceSource(texture.source);
                // A node subtree renders straight back into this context, which is
                // what discovers its fonts and image fills. A bare `Graphics` goes
                // back through the public `draw()` (not `drawOps`) so its text ops
                // pick up the ambient text defaults here exactly as they will when
                // the backend rasterizes the same source for real.
                if (source.kind === "graphics") this.draw(source.graphics);
                else source.node.render(this);
            } finally {
                this.surfaceDepth--;
                this.currentWidth = priorWidth;
                this.currentHeight = priorHeight;
            }
        });
    }

    /**
     * Effects can reference assets too — a `texture` effect names an image the
     * same way an image fill does. Most declare nothing, so `prepareEffect` is a
     * cheap miss for the common case.
     */
    private trackEffects(effects: readonly SceneEffect[] | undefined): void {
        if (!effects) return;
        for (const effect of effects) {
            prepareEffect(effect, this.tracker, this.currentWidth, this.currentHeight);
        }
    }

    /**
     * `render()` is only ever driven from within `Precomp.precompScene`'s
     * bracketed loop today, unlike `TrackMeasureScope` (see its doc comment
     * for the detached-measurement path that hits this for real) — but it
     * hits the exact same `ensureFrame()` throw if a future caller ever
     * invokes it unbracketed, so guard it the same way defensively.
     */
    protected drawGraphics(graphics: Graphics): void {
        if (this.tracker.isActive) {
            this.drawOps(graphics);
            return;
        }
        this.tracker.start(0);
        try {
            this.drawOps(graphics);
        } finally {
            this.tracker.end();
        }
    }

    private drawOps(graphics: Graphics): void {
        for (const op of graphics.ops()) {
            switch (op.kind) {
                case "rect":
                case "ellipse":
                case "polygon":
                case "polygram":
                    this.currentWidth = op.state.width ?? 0;
                    this.currentHeight = op.state.height ?? 0;
                    break;

                case "path":
                case "line":
                    // width/height default to 0 on these descriptors (a path's
                    // extent isn't implied by its command list) — callers that
                    // paint an image/video fill on a raw path/line and want it
                    // sized correctly need to pass explicit width/height, e.g.
                    // `PathBuilder.toPathState({ width, height, centerBounds })`.
                    this.currentWidth = op.state.width ?? 0;
                    this.currentHeight = op.state.height ?? 0;
                    break;

                case "text":
                    this.currentWidth = op.state.width ?? 0;
                    this.currentHeight = op.state.height ?? 0;
                    this.trackFont(op.state.fontFamily, op.state.fontWeight);
                    // Text-selection segments can override fill/stroke per-piece
                    // (and paint in place of the node-level fill op — see
                    // Text.renderSelf) — walk them too so an image/video used as
                    // a selection's paint isn't missed.
                    for (const seg of op.state.segments ?? []) {
                        this.trackFills(seg.fill);
                        for (const s of seg.stroke ?? []) this.trackFills(s.fill);
                    }
                    break;

                case "richText":
                    this.currentWidth = op.state.width ?? 0;
                    this.currentHeight = op.state.height ?? 0;
                    // Each span carries its own font and paints its own
                    // fill/stroke directly (RichText.renderSelf emits no
                    // separate node-level fill op) — walk every span.
                    for (const span of op.state.spans ?? []) {
                        this.trackFont(span.fontFamily, span.fontWeight);
                        this.trackFills(span.fill);
                        for (const s of span.stroke ?? []) this.trackFills(s.fill);
                    }
                    break;

                case "fill":
                    this.trackFills(resolveFillArray(op.fills));
                    break;

                case "stroke":
                    for (const s of resolveStrokeArray(op.strokes)) this.trackFills(s.fill);
                    break;

                case "shadow":
                    for (const s of resolveShadowArray(op.shadows)) this.trackFills(s.fill);
                    break;

                // cut/mask/applyMask/endMask/effects carry no asset references.
                case "effects":
                    this.trackEffects(op.effects);
                    break;

                // cut/mask/applyMask/endMask carry no asset references.
            }
        }
    }

    measureText(): number {
        return 0;
    }

    unmount(): void { }

    dispose(): void {
        super.dispose();
    }

    execute(callback: () => void): void {
        callback();
    }

    screenshot(): string | undefined {
        return undefined;
    }

    /**
     * Nothing is rasterized here, but `draw` still has to *run* — a caller that
     * rasterizes a subtree only exposes that subtree's fonts and image fills by
     * walking it. Skipping the callback would leave a `<Text>` unshaped and an
     * `<Image>` unloaded.
     */
    override rasterizeOffscreen(_width: number, _height: number, draw: () => void): null {
        draw();
        return null;
    }

    /**
     * Node-level effects arrive here rather than as a graphics op, so this is no
     * longer a pure no-op: a `texture` effect on a node must get its image
     * requested during precomp, or the renderer's synchronous lookup finds
     * nothing and the effect silently has no texture to draw.
     */
    transform(state: Partial<TransformState>): RenderContext {
        const { width, height } = state;
        const priorWidth = this.currentWidth;
        const priorHeight = this.currentHeight;
        this.currentWidth = width ?? 0;
        this.currentHeight = height ?? 0;
        this.trackEffects(state.effects);
        this.currentWidth = priorWidth;
        this.currentHeight = priorHeight;
        return this;
    }

    beginBoolean(_op: BooleanOperation): void { }
    endBoolean(): void { }

    beginMask(_options?: MaskOptions): void { }
    applyMask(): void { }
    endMask(): void { }

    beginClip(_clip: Clip): void { }
    endClip(): void { }

    beginCamera(
        _viewport: { x: number; y: number; width: number; height: number },
        _centerOn: Vector2,
        _zoom: number,
        _heading: number,
    ): void { }
    endCamera(): void { }
}
