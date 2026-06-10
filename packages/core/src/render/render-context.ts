
import { FontStyle } from "@/attributes/text/span";
import { type RectState } from "./descriptors/rect";
import { TransformState } from "./descriptors/transform";

import { PathState } from "./descriptors/path";
import { EllipseState } from "./descriptors/ellipse";
import { LineState } from "./descriptors/line";
import { PolygonState } from "./descriptors/polygon";
import { PolygramState } from "./descriptors/polygram";
import { MeasureScope } from "./measure-scope";
import { Graphics } from "./graphics";
import { Vector2 } from "@/attributes/layout/vector2";
import { MaskOptions } from "@/attributes/mask/mask";
import { BooleanOperation } from "@/attributes/mask/boolean";
import type { BulgeEffect } from "@/attributes/shape/effects/implementations/bulge";
import type { MagnifyEffect } from "@/attributes/shape/effects/implementations/magnify";
import type { SkSLEffect } from "@/attributes/shape/effects/implementations/sksl";








/**
 * A shape outline to clip against, tagged by kind so the renderer can build the
 * same path it would draw. Used by background blur to confine the backdrop blur
 * to any shape's silhouette.
 */
export type ClipShape =
    | { kind: "rect"; state: Partial<RectState> }
    | { kind: "ellipse"; state: Partial<EllipseState> }
    | { kind: "polygon"; state: Partial<PolygonState> }
    | { kind: "polygram"; state: Partial<PolygramState> }
    | { kind: "path"; state: Partial<PathState> }
    | { kind: "line"; state: Partial<LineState> };

/**
 * A bounding box in the current node's local space (origin = the node's
 * layout-cell centre, the same space shapes are drawn in). `left/top` use the
 * canvas convention (y down).
 */
export interface SpaceRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * Reference rects a fill can resolve against, supplied per-node at `begin()`.
 * `local`/`global` are derived from the drawn shapes themselves, so only the
 * outer frames are passed here.
 */
export interface SpaceRects {
    /** The parent node's content rect, in this node's local space. */
    parent?: SpaceRect;
    /** The render viewport, in this node's local space. */
    view?: SpaceRect;
}

/**
 * Low-level shape-drawing API. Shapes are no longer declared directly on the
 * context — they are built with a {@link Graphics} command list and submitted
 * via {@link draw}. Multiple shapes chained on a `Graphics` before a paint call
 * are combined into a single surface and painted together.
 *
 *   ctx.draw(new Graphics().ellipse(...).rect(...).fill(...));  // shared surface
 */
export abstract class Render2DContext {
    /** Paint a built `Graphics` command list against this context. */
    abstract draw(graphics: Graphics): void;
}




/**
 * The full rendering context passed to every scene-graph node when it draws
 * itself. Combines shape drawing (`Render2DContext`), text measurement
 * (`MeasureScope`), and higher-level scoping operations (transforms, masks,
 * clips, camera, boolean ops, backdrop effects).
 *
 * `begin(id)` / `end()` bracket each node's draw call so the context can
 * track which node is active and look up per-node state (space rects, etc.).
 * The concrete implementations (`CanvasKitRenderContext`, `SvgRenderContext`,
 * …) translate these abstract calls into renderer-specific drawing commands.
 */
export abstract class RenderContext extends Render2DContext implements MeasureScope {
    abstract measureText(text: string, fontSize: number, fontFamily: string, fontWeight?: number, letterSpacing?: number, fontStyle?: FontStyle): number;

    /** Stack of node ids currently being drawn, innermost last. */
    protected currentNodeStack: string[] = [];

    /** Returns the id of the innermost node currently being drawn. */
    protected currentNodeId(): string {
        if (this.currentNodeStack.length === 0) {
            throw new Error("No current node in context");
        }

        return this.currentNodeStack[this.currentNodeStack.length - 1];
    }

    /** Remove all renderer-side resources for the current node (called on unmount). */
    abstract unmount(): void;

    private _disposed = false;
    /** `true` after `dispose()` — the context must not be used after this point. */
    isDisposed(): boolean {
        return this._disposed;
    }
    dispose(): void {
        this._disposed = true;
    }

    /**
     * Execute `callback`, which issues shape/paint calls, and flush the result
     * to the underlying render target (canvas, SVG document, etc.).
     */
    abstract execute(callback: () => void): void;
    /** Capture the current frame as a base-64 PNG data URL, or `undefined` if unsupported. */
    abstract screenshot(): string | undefined;

    /**
     * Push a transform (position, rotation, scale, opacity, …) and return
     * `this` so subsequent draw calls are issued in the transformed space.
     * The transform is popped when `end()` is called for the node that pushed it.
     */
    abstract transform(state: Partial<TransformState>): RenderContext;

    /**
     * Open a boolean-path collection scope. Shapes drawn until `endBoolean()`
     * are gathered (fills/strokes suppressed) and combined with `op`. After
     * `endBoolean()` the merged path is left as the active surface, so a
     * paint-only `Graphics` (`new Graphics().fill(...).stroke(...)`) submitted via
     * `draw()` styles the combined result.
     */
    abstract beginBoolean(op: BooleanOperation): void;
    abstract endBoolean(): void;

    // Mask scope (imperative) — used by MaskGroup and other node-level callers
    // that manage the scope with explicit begin/apply/end:
    //
    //   beginMask({ mode, inverted })
    //   <render mask child>          // child draws its own Graphics
    //   applyMask()
    //   <render content children>    // children draw their own Graphics
    //   endMask()
    //
    // The chain-friendly form lives on `Graphics` (`.mask().applyMask().endMask()`)
    // for inline use within a single `draw()`.
    //
    // For `vector` mode the mask child's path is collected and used as a
    // clipPath; fills/strokes are suppressed. For `alpha` and `luminance`
    // the mask is rendered into an offscreen layer and combined with content
    // via blend modes.
    abstract beginMask(options?: MaskOptions): void;
    abstract applyMask(): void;
    abstract endMask(): void;

    /**
     * Push a rectangular clip region so children are confined to the node's
     * rect boundary. Paired with `endClip()`.
     */
    abstract beginClipRect(state: Partial<RectState>): void;
    /** Push an elliptical clip region. Paired with `endClip()`. */
    abstract beginClipEllipse(state: Partial<EllipseState>): void;
    /** Pop the most-recently pushed clip region. */
    abstract endClip(): void;

    /**
     * Push a silhouette clip built from `shape`'s outline — used by backdrop
     * effects to confine the effect to the node's exact boundary regardless of
     * shape type. Paired with `endClip()`. No-op by default; renderers that
     * don't support it can leave this unimplemented.
     */
    beginClipShape(_shape: ClipShape): void { }

    /**
     * Open a backdrop-blur layer. The already-painted canvas beneath the node
     * is blurred by `radius` and composited back, clipped to the active
     * silhouette clip. No-op by default.
     */
    beginBackgroundBlur(_radius: number): void { }
    endBackgroundBlur(): void { }

    /**
     * Open a backdrop-distortion (magnify) layer. The backdrop is warped by a lens
     * centred on the node (`width` × `height`), clipped to the active
     * silhouette clip. No-op by default.
     */
    beginBackgroundDistortion(_effect: MagnifyEffect, _width: number, _height: number): void { }
    endBackgroundDistortion(): void { }

    /**
     * Begin a foreground (node-content) distortion. Unlike the backdrop
     * distortion, this warps the node's *own* drawing — every paint call between
     * `begin` and `end` is captured, then redrawn through the bulge lens centred
     * on the node (`width` × `height`). Behaves like blur: the effect applies to
     * the node itself, not the content beneath it. No-op by default.
     */
    beginForegroundDistortion(_effect: BulgeEffect, _width: number, _height: number): void { }
    endForegroundDistortion(): void { }

    /**
     * Open a custom SkSL backdrop layer. The shader receives
     * `uniform shader u_backdrop` (a snapshot of the canvas beneath the node)
     * and can produce distortion, ripple, refraction, etc., clipped to the
     * active silhouette clip. No-op by default.
     */
    beginBackdropSkSL(_effect: SkSLEffect, _width: number, _height: number): void { }
    endBackdropSkSL(): void { }

    /**
     * Push a camera viewport. Clips to `viewport` (canvas-space, centred
     * coords) and applies the inverse camera transform so children render as
     * seen through the lens. `heading` rotates the world counter to the camera
     * angle. Paired with `endCamera()`.
     *
     * @param viewport  Bounding rect of the camera node in canvas space.
     * @param centerOn  World-space point the camera looks at.
     * @param zoom      Uniform scale applied around `centerOn`.
     * @param heading   Camera rotation in degrees.
     */
    abstract beginCamera(viewport: { x: number; y: number; width: number; height: number }, centerOn: Vector2, zoom: number, heading: number): void;
    abstract endCamera(): void;



    /**
     * Reference rects (parent frame / viewport) for each node on the draw
     * stack, in the node's local space. Kept parallel to `currentNodeStack`
     * so fills with `space: 'parent' | 'view'` can resolve against them.
     */
    protected spaceRectsStack: SpaceRects[] = [];

    /**
     * Open a node draw scope. Must be paired with `end()`. Pushes `id` onto
     * the node stack and records the optional `rects` for gradient-space
     * resolution.
     *
     * @param id    Stable node identifier (used for layer caching, etc.).
     * @param rects Parent / viewport rects in this node's local space.
     */
    begin(id: string, rects?: SpaceRects): void {
        this.currentNodeStack.push(id);
        this.spaceRectsStack.push(rects ?? {});
    }

    /** Close the innermost node draw scope opened by `begin()`. */
    end(): void {
        this.currentNodeStack.pop();
        this.spaceRectsStack.pop();
    }

    /** Reference rects for the node currently being drawn (parent / viewport). */
    protected currentSpaceRects(): SpaceRects {
        return this.spaceRectsStack[this.spaceRectsStack.length - 1] ?? {};
    }



}
