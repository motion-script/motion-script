import type { FontStyle } from "@/attributes/text/span";
import type { TransformState } from "./descriptors/transform";
import type { Measurer2D } from "./measurer";
import type { TextState } from "./descriptors/text";
import type { TextBlockLayout } from "./text-layout";
import type { Graphics2D } from "./graphics2d";
import type { Clip } from "./clip";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { MaskOptions } from "@/attributes/mask/mask";
import type { BooleanOperation } from "@/attributes/mask/boolean";
import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { TextStyle } from "@/runtime/builtin-context";
import type { Size2D } from "@/attributes/layout/size";

/**
 * Where an effect scope draws: `'foreground'` warps/filters the node's *own*
 * content (its fill, stroke and children), `'backdrop'` warps/filters the canvas
 * content already painted *beneath* the node (clipped to its silhouette). See
 * {@link RenderContext2D.beginEffects}.
 */
export type EffectTarget = "foreground" | "backdrop";

/**
 * Pixels produced by {@link RenderContext2D.rasterize}: RGBA8888,
 * unpremultiplied, top-down (canvas row order). `width`/`height` are **device**
 * px, so they reflect the pixel ratio the renderer actually used rather than the
 * logical size that was asked for.
 */
export interface RasterizedSurface {
    pixels: Uint8Array;
    width: number;
    height: number;
}

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
 * Per-node state supplied to {@link RenderContext2D.begin} for the duration of a
 * node's draw scope. Carries the node identity and gradient-space `rects` plus
 * the node's per-frame motion, sampled at render time. Motion-driven effects
 * (e.g. motion blur) read the current node's `velocity` from this state instead
 * of being authored with a fixed direction.
 *
 * Velocity fields are `0`/`{0,0}` when the motion is unknown — the first frame a
 * node renders, or after a time discontinuity (scrub/seek) where no trustworthy
 * delta exists.
 */
export interface NodeRenderState {
    /** Stable node identifier. */
    id: string;
    /** Parent / viewport rects in this node's local space. */
    rects: SpaceRects;
    /** How long this node has existed, in seconds (`NodeTime.elapsed`). */
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
 * The drawing surface a `Node2D` paints into — **the whole of what a node may
 * ask of a renderer, and nothing else.**
 *
 * Shapes are never declared directly on the context: they are built with a
 * {@link Graphics2D} command list and submitted via {@link draw}. Multiple
 * shapes chained on one `Graphics2D` before a paint call are combined into a
 * single surface and painted together:
 *
 *   ctx.draw(new Graphics2D().ellipse(...).rect(...).fill(...));  // shared surface
 *
 * On top of that it carries text measurement — it extends {@link Measurer2D}, so
 * a node measures and draws through one object — and the higher-level scoping
 * operations: transforms, masks, clips, camera, boolean ops, effect scopes.
 * `begin(state)` / `end()` bracket each node's draw call so the context can
 * track which node is active.
 *
 * **An interface, with `CanvasRenderContext2D` as its one base class.** What a
 * node calls and what a *host* calls are different lists: `execute`,
 * `screenshot`, `unmount` and `dispose` drive a render pass and have no business
 * being reachable from inside one. Splitting them is what keeps this surface
 * the size it is. Every real backend still extends the class, which preserves
 * the `draw` to `drawGraphics` invariant that gives them all one implementation
 * of text-default resolution.
 *
 * `RenderContext3D` is its sibling, not its subclass: the two share no members,
 * because a 3D scene is described with lights, a camera and meshes rather than
 * with paths and paint.
 */
export interface RenderContext2D extends Measurer2D {
    measureText(
        text: string,
        fontSize: number,
        fontFamily: string,
        fontWeight?: number,
        letterSpacing?: number,
        fontStyle?: FontStyle,
    ): Size2D;

    // ---- Inherited text-style defaults ------------------------------------
    // `<DefaultTextStyle>` reaches a `Text`/`RichText` node through the context
    // map, applied once when the node binds. A raw `Graphics2D` has no node to
    // bind, so it inherits the same defaults here instead — pushed around a
    // subtree's draw scope, and folded into each `text`/`richText` op by
    // `draw()`. Same vocabulary (`TextStyle`), same precedence, two channels.

    /**
     * Set text-style defaults for everything drawn until the matching
     * {@link popTextStyle} — the drawn-graphics half of `<DefaultTextStyle>`.
     *
     * `style` is **merged** onto the defaults already in effect, per key, so
     * nesting accumulates the way the node channel does: an outer scope's
     * `fontFamily` and an inner scope's `fontSize` both apply, and a key set by
     * both takes the inner value. Values are resolved (a tweened `fontSize`
     * arrives as this frame's number), not callbacks.
     *
     * Pass `null` to open a scope that inherits **nothing** — not the enclosing
     * defaults and not the project's `theme.typography.default`. That is for a
     * node whose text is its own vocabulary rather than the document's: `Code`
     * does it so a scene-wide serif face doesn't reflow a monospaced code block.
     *
     * Always pair with `popTextStyle()` in a `finally`; the stack is shared with
     * every sibling drawn afterwards.
     */
    pushTextStyle(style: TextStyle | null): void;

    /** Close the innermost scope opened by {@link pushTextStyle}. */
    popTextStyle(): void;

    /**
     * The text-style defaults in effect right now: the innermost
     * {@link pushTextStyle} scope, or the project's `theme.typography.default`
     * when no scope is open — the same preset a `Text` node falls back to, so a
     * drawn label and a node label agree on the project's base typography.
     */
    readonly defaultTextStyle: TextStyle;

    /**
     * Replay a built `Graphics2D` against this context.
     *
     * Resolves the ambient text defaults onto the op list before handing it to
     * the backend, which is what keeps the real renderer and the precomp asset
     * walk agreeing on which font an under-specified `text` op shapes with: a
     * family that one resolves and the other does not is a font that never loads
     * and glyphs that never paint.
     */
    draw(graphics: Graphics2D): void;

    /**
     * Lay `state` out the way it would be drawn and report where every character
     * landed — see {@link TextBlockLayout} for the space and the caret model.
     *
     * This is what makes on-canvas text editing possible: glyph positions live
     * in the backend's shaper, so a host drawing its own caret and selection has
     * no way to compute them, and anything it approximates in the DOM disagrees
     * with the render as soon as the font, the line height or the wrapping does.
     *
     * Takes the whole {@link TextState} rather than a handful of font fields
     * because the resolution a caret has to agree with lives in the backend:
     * `'autofit'` picks a size from the box, `wrap` turns the width into a wrap
     * limit, and `textAlign` places the lines within it. Handing over the same
     * descriptor that gets drawn is what keeps the two from drifting apart.
     *
     * Returns `null` when the backend cannot measure this — the default, so a
     * backend that never needed glyph positions keeps working, and for cases no
     * caret model fits: text-on-path (glyphs follow a curve, not a line box) and
     * a block with active selection segments.
     */
    layoutTextBlock(state: Partial<TextState>): TextBlockLayout | null;

    /**
     * Push a transform (position, rotation, scale, opacity, …) and return the
     * context so subsequent draw calls are issued in the transformed space. The
     * transform is popped when `end()` is called for the node that pushed it.
     */
    transform(state: Partial<TransformState>): RenderContext2D;

    /**
     * Open a boolean-path collection scope. Shapes drawn until `endBoolean()`
     * are gathered (fills/strokes suppressed) and combined with `op`. After
     * `endBoolean()` the merged path is left as the active surface, so a
     * paint-only `Graphics2D` (`new Graphics2D().fill(...).stroke(...)`)
     * submitted via `draw()` styles the combined result.
     */
    beginBoolean(op: BooleanOperation): void;
    endBoolean(): void;

    // Mask scope (imperative) — used by MaskGroup and other node-level callers
    // that manage the scope with explicit begin/apply/end:
    //
    //   beginMask({ mode, inverted })
    //   <render mask child>          // child draws its own Graphics2D
    //   applyMask()
    //   <render content children>    // children draw their own Graphics2D
    //   endMask()
    //
    // The chain-friendly form lives on `Graphics2D` (`.mask().applyMask().endMask()`)
    // for inline use within a single `draw()`.
    //
    // For `vector` mode the mask child's path is collected and used as a
    // clipPath; fills/strokes are suppressed. For `alpha` and `luminance`
    // the mask is rendered into an offscreen layer and combined with content
    // via blend modes.
    beginMask(options?: MaskOptions): void;
    applyMask(): void;
    endMask(): void;

    /**
     * Push a clip region built from a {@link Clip} command list. The clip's
     * shapes are unioned (with `cut()`s subtracted) into a single path and
     * intersected with the active clip, so children are confined to that
     * compound outline — any silhouette, not just a rect or ellipse. Used both
     * for a node's `clip` boundary and to confine backdrop effects (blur,
     * magnify) to the node's exact shape. Paired with `endClip()`.
     */
    beginClip(clip: Clip): void;
    /** Pop the most-recently pushed clip region. */
    endClip(): void;

    /**
     * Open an effect scope over the node, applying `effects` to either the node's
     * own content or the content beneath it. Paired with {@link endEffects}.
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
     * (e.g. pixelate) and shader lens boxes.
     */
    beginEffects(effects: SceneEffect[], target: EffectTarget, width: number, height: number): void;
    endEffects(): void;

    /**
     * Draw `draw` into an offscreen buffer instead of onto the canvas, and hand
     * back its pixels. The buffer is `width` × `height` **logical** px with its
     * origin at the centre, matching the space a node draws in — so `draw` can be
     * an ordinary `render()` call on a node subtree and needs no special casing.
     *
     * This is what backs `Tex.surface`: `Canvas3D` rasterizes each of its 2D
     * sources through here, then hands the pixels to the 3D backend as a texture.
     * It runs *inside* the frame that consumes it, so a scrubbed frame is
     * identical to a played one.
     *
     * Returns `null` when the backend cannot rasterize offscreen — the material
     * then renders without that map. `pixelRatio` is a ceiling on the buffer's
     * device-pixel scale, not a guarantee; the renderer may clamp it.
     */
    rasterize(
        width: number,
        height: number,
        draw: () => void,
        pixelRatio?: number,
    ): RasterizedSurface | null;

    /**
     * Push a camera viewport. Clips to `viewport` (canvas-space, centred
     * coords) and applies the inverse camera transform so children render as
     * seen through the lens. `heading` rotates the world counter to the camera
     * angle. Paired with `endCamera()`.
     *
     * @param viewport Bounding rect of the camera node in canvas space.
     * @param lookAt   World-space point the camera looks at.
     * @param zoom     Uniform scale applied around `lookAt`.
     * @param heading  Camera rotation in degrees.
     */
    beginCamera(viewport: { x: number; y: number; width: number; height: number }, lookAt: Vector2, zoom: number, heading: number): void;
    endCamera(): void;

    /**
     * Whether this context ever reads `NodeRenderState.rects`.
     *
     * True for anything that actually paints, since a fill with `space:'parent'`
     * resolves against them. A context that only inspects *what* would be drawn
     * never looks at them, and computing them costs an object allocation per node
     * per frame. Nodes check this before doing that work; see `Node2D.beforeRender`.
     */
    readonly readsSpaceRects: boolean;

    /**
     * Whether this context only cares about *visible* output.
     *
     * True for anything that paints: a subtree at zero opacity contributes no
     * pixels, so walking it produces draw calls the rasterizer will discard.
     *
     * A context that inspects rather than paints sets this `false`, and that is
     * the whole reason this is a capability rather than an unconditional check:
     * such a walk exists to discover which images, videos, fonts and effects a
     * frame *references* — regardless of whether they can be seen. An invisible
     * node's font still has to load, because it may fade in two frames later and
     * glyphs that were never registered never paint. Skipping it there is not an
     * optimisation, it is a missing asset.
     *
     * Same shape and same reasoning as {@link readsSpaceRects}: the context
     * declares what it needs, and nodes check before doing work that would be
     * thrown away. See `Node2D.render`.
     */
    readonly drawsVisibleOnly: boolean;

}

/**
 * A render *pass*: a {@link RenderContext2D} plus the per-node scope bracket the
 * walk opens around each node.
 *
 * Split off from the drawing surface because the two have different callers.
 * `begin`/`end` are `Node2D.render`'s, once per node, and they push onto a stack
 * every fill with `space:'parent'` and every motion-driven effect reads back
 * from. A custom node's `renderSelf` calling one would open a scope nothing
 * closes — and since `renderSelf` is handed a {@link RenderContext2D}, it now
 * cannot.
 *
 * Every backend implements this; a host driving a render pass holds one.
 *
 * @internal
 */
export interface RenderPass2D extends RenderContext2D {
    /**
     * Open a node draw scope. Must be paired with `end()`. Pushes the node's
     * id and {@link NodeRenderState} (gradient-space rects + per-frame motion)
     * for the duration of the scope.
     */
    begin(state: NodeRenderState): void;

    /** Close the innermost node draw scope opened by `begin()`. */
    end(): void;
}
