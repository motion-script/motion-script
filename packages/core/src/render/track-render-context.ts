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
import { track3DResources } from "@/render3d/tracking";

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

    private trackFont(fontFamily: string | undefined, fontWeight: number | string | undefined): void {
        if (!fontFamily) return;
        this.tracker.requestFont(fontFamily, String(fontWeight ?? 400));
    }

    private trackFills(fills: readonly FillResolved[] | undefined): void {
        if (!fills) return;
        for (const fill of fills) {
            prepareFill(fill, this.tracker, this.currentWidth, this.currentHeight);
        }
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
    draw(graphics: Graphics): void {
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

                case "scene3D":
                    // Size 3D texture requests off the composite rect, the same way
                    // a 2D fill sizes off its shape — a texture on a small node
                    // doesn't need full-resolution pixels.
                    this.currentWidth = op.state.width;
                    this.currentHeight = op.state.height;
                    track3DResources(op.graphics, this.tracker, this.currentWidth, this.currentHeight);
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
