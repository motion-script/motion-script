
import { FontStyle } from "@/attributes/text/span";
import { TransformState } from "./descriptors/transform";

import { MeasureScope } from "./measure-scope";
import { Graphics } from "./graphics";
import { Clip } from "./clip";
import { Vector2 } from "@/attributes/layout/vector2";
import { MaskOptions } from "@/attributes/mask/mask";
import { BooleanOperation } from "@/attributes/mask/boolean";
import type { SceneEffect } from "@/attributes/shape/effects/union";








/**
 * Where an effect scope draws: `'foreground'` warps/filters the node's *own*
 * content (its fill, stroke and children), `'backdrop'` warps/filters the canvas
 * content already painted *beneath* the node (clipped to its silhouette). See
 * {@link RenderContext.beginEffectScope}.
 */
export type EffectTarget = "foreground" | "backdrop";

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
 * `local` is derived from the drawn shapes themselves and `global` (the
 * viewport) is computed by the renderer from the surface size, so only the
 * parent frame is passed here.
 */
export interface SpaceRects {
    /** The parent node's content rect, in this node's local space. */
    parent?: SpaceRect;
}

/**
 * Per-node state supplied to {@link RenderContext.begin} for the duration of a
 * node's draw scope. Carries the node identity and gradient-space `rects` (what
 * `begin` used to take as separate arguments) plus the node's per-frame motion,
 * sampled at render time. Motion-driven effects (e.g. motion blur) read the
 * current node's `velocity` from this state instead of being authored with a
 * fixed direction.
 *
 * Velocity fields are `0`/`{0,0}` when the motion is unknown — the first frame a
 * node renders, or after a time discontinuity (scrub/seek) where no trustworthy
 * delta exists.
 */
export interface NodeRenderState {
    /** Stable node identifier (was `begin`'s first argument). */
    id: string;
    /** Parent / viewport rects in this node's local space (was `begin`'s second argument). */
    rects: SpaceRects;
    /** How long this node has existed, in seconds (NodeClock.elapsed). */
    elapsed: number;
    /** The frame delta, in seconds, used to derive displacement from velocity. */
    dt: number;
    /** Translational velocity in px/sec, world space (y-down). `{0,0}` when unknown. */
    velocity: Vector2;
    /** Heading of `velocity` in degrees (`atan2(vy, vx)`). `0` when unknown. */
    direction: number;
    /** Magnitude of `velocity` in px/sec. `0` when unknown. */
    speed: number;
    /** Rotational velocity in degrees/sec. `0` when unknown. Reserved for radial motion blur. */
    angularVelocity: number;
    /** Scale velocity in scale-units/sec. `0` when unknown. Reserved for zoom motion blur. */
    scaleVelocity: number;
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
     * Push a clip region built from a {@link Clip} command list. The clip's
     * shapes are unioned (with `cut()`s subtracted) into a single path and
     * intersected with the active clip, so children are confined to that
     * compound outline — any silhouette, not just a rect or ellipse. Used both
     * for a node's `clip` boundary and to confine backdrop effects (blur,
     * magnify) to the node's exact shape. Paired with `endClip()`.
     */
    abstract beginClip(clip: Clip): void;
    /** Pop the most-recently pushed clip region. */
    abstract endClip(): void;

    /**
     * Open an effect scope over the node, applying `effects` to either the node's
     * own content or the content beneath it. Paired with {@link endEffectScope}.
     *
     * `target`:
     * - `'foreground'` — warps/filters the node's *own* drawing (its fill, stroke
     *   and children captured between begin/end), like blur. Used for bulge and
     *   foreground posterize.
     * - `'backdrop'` — warps/filters the canvas content already painted *beneath*
     *   the node, clipped to the active silhouette clip, so the node's own edges
     *   stay sharp (Figma-style). Used for backdrop-flagged filters (blur,
     *   grayscale, pixelate, …), magnify, backdrop posterize, and backdrop SkSL.
     *
     * The renderer decides per effect whether to compose it as an `ImageFilter`
     * or run it as a snapshot/redraw shader — callers never route by effect type.
     * `width`/`height` are the node's logical size, for size-relative effects
     * (e.g. pixelate) and shader lens boxes. No-op by default.
     */
    beginEffectScope(_effects: SceneEffect[], _target: EffectTarget, _width: number, _height: number): void { }
    endEffectScope(): void { }

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
     * Per-node render state for each node on the draw stack, in push order
     * (innermost last). Kept parallel to `currentNodeStack` so fills with
     * `space: 'parent'` can resolve their reference rect and so
     * motion-driven effects can read the current node's velocity.
     */
    protected renderStateStack: NodeRenderState[] = [];

    /**
     * Open a node draw scope. Must be paired with `end()`. Pushes the node's
     * id and {@link NodeRenderState} (gradient-space rects + per-frame motion)
     * for the duration of the scope.
     *
     * @param state Identity, reference rects, and sampled motion for this node.
     */
    begin(state: NodeRenderState): void {
        this.currentNodeStack.push(state.id);
        this.renderStateStack.push(state);
    }

    /** Close the innermost node draw scope opened by `begin()`. */
    end(): void {
        this.currentNodeStack.pop();
        this.renderStateStack.pop();
    }

    /** Reference rects for the node currently being drawn (parent / viewport). */
    protected currentSpaceRects(): SpaceRects {
        return this.renderStateStack[this.renderStateStack.length - 1]?.rects ?? {};
    }

    /** Full render state (incl. velocity) for the node currently being drawn, if any. */
    protected currentRenderState(): NodeRenderState | undefined {
        return this.renderStateStack[this.renderStateStack.length - 1];
    }



}
