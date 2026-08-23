import { Signal } from "@/signals/signal";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { type ChainableCommand } from "@/tween/chain";
import { type Command } from "@/tween/command";
import { TweenStepper } from "@/tween/stepper";
import { AssetTracker } from "@/assets/tracker";
import { prepareEffect } from "@/attributes/shape/effects/registry";
import { property } from "@/attributes/properties/decorator";
import { effectsProperty, insetsProperty, anchorProperty } from "@/attributes/properties/typed";
import { createMotionHistory, MotionHistory, sampleMotion, primeMotion } from "./node-motion";
import { addChildAtAnimated, removeChildAtAnimated, reparentAnimated } from "./node-lifecycle";

import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { NodeBlendMode } from "@/attributes/shape/fill/blend";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Vector2 } from "@/attributes/layout/vector2";
import { Anchor, lerpAnchor, resolveAnchor } from "@/attributes/layout/anchor";
import { bindAnchorTarget, findAnchorKey, resolveAnchorTargetOnce, validateAnchorProps } from "@/attributes/layout/anchor-resolve";
import type { WorldTransform } from "@/attributes/layout/world-transform";
import { Node, type NodeConfig, type NodeDimension, type NodeProps } from "./node";
import {
    applyToPoint,
    facesAway,
    hasProjection3D,
    invert,
    Matrix2D,
    multiply,
    type Projection3D,
} from "@/attributes/layout/matrix2d";
import { expandTransform3D, type NodeTransform3D } from "@/attributes/layout/transform3d";
import { localMatrix, rotateOffset, worldAnchors } from "./node-transform";
import {
    applyBackdropEffects as applyBackdropEffectsImpl,
    applyContentEffectScope,
    computeSpaceRects,
} from "./node-render";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { NodeRenderState, RenderContext2D, SpaceRects } from "@/render/render-context2d";
import { Clip } from "@/render/clip";
import { TransformState } from "@/render/descriptors/transform";
import { Size2D, SizeInput, expandSize } from "@/attributes/layout/size";
import { Effect } from "@/attributes/shape/effects/chain";
import { Insets, InsetsResolved } from "@/attributes/layout/insets";
import { lerpSizeInput } from "@/layout/tweens";
import { isAutoSize, resolveSize } from "@/layout/size-resolver";
import { Measurer } from "@/render/measurer";
import { layoutFlowChildren } from "@/layout/flow-layout";
import {
    ChildPositioning,
    RelativeToParent,
    resolvePositioning,
} from "@/attributes/layout/positioning";

/**
 * Stand-in for a node's reference rects when the context never reads them.
 * Shared and empty — `computeSpaceRects` returns the same shape for a node with
 * no parent, so consumers already handle it. See {@link Node2D.beforeRender}.
 */
const NO_SPACE_RECTS: SpaceRects = {};

/** The node centre in the normalised `[-1, 1]` anchor space — `pivot`'s own default. */
const ORIGIN_2D: Vector2 = { x: 0, y: 0 };

// NodeClock, WorldTransform, PropInput, and PropInputs now live in dedicated
// modules (see imports above) and are re-exported below so existing
// `from ".../node2d"` imports keep resolving.
export type { NodeClock } from "./node-clock";
export { Node } from "./node";
export type { NodeChildren, NodeConfig, NodeMetadata, NodeDimension, NodeProps } from "./node";
export type { WorldTransform } from "@/attributes/layout/world-transform";
export type { PropInput, PropInputs } from "@/attributes/properties/inputs";
export type { ChildPositioning, RelativeToParent } from "@/attributes/layout/positioning";

/**
 * Map a prop name to a large, stable offset into a {@link Random.noise} field,
 * so two props wiggled together sample independent regions and don't move in
 * lockstep. A djb2 hash (not the name's length — `x`/`y` collide there) spreads
 * the offsets ~thousands of units apart, well past any overlap for a realistic
 * wiggle duration × frequency.
 */
function wigglePhase(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    // Spread across a wide span; the sign of the hash doesn't matter (noise is
    // defined for negative inputs too).
    return (h % 100000) * 13.37;
}

/**
 * The camera props a node pushes around its children — the three inputs
 * `RenderContext2D.beginCamera` takes beyond the viewport rect. See
 * {@link Node2D._cameraScope}.
 */
/** @internal */
export interface CameraScope {
    /** World point (y-up) the viewport centres on — what the camera is aimed at. */
    lookAt: Vector2;
    /** Uniform zoom factor. */
    zoom: number;
    /** Viewport rotation in degrees; the renderer applies it as `rotate(-heading)`. */
    heading: number;
}

/**
 * Call-wide options for {@link Node2D.wiggle}, the trailing bag that shapes every
 * prop in the call (mirrors how `TweenOptions` bundles `ease`/`lerp`/`delay`).
 */
export interface WiggleOptions {
    /**
     * Oscillations per second — higher is faster/twitchier. Applies to every
     * prop in the call; for a per-prop rate, use a second `wiggle` in the same
     * {@link parallel}. Defaults to `4`.
     */
    frequency?: number;
    /**
     * Fraction of the duration (`0`–`1`) spent easing each offset back to its
     * base at the end, so props land without a snap. `0` is a hard cut (stop
     * mid-swing). Defaults automatically to a short window that shrinks for
     * longer wiggles, and is `0` for an unbounded (`Infinity`) duration.
     */
    settle?: number;
}

export interface Node2DProps extends NodeProps {
    x: number; // 0 is center, negative is left, positive is right
    y: number; // 0 is center, negative is down, positive is up
    width: SizeInput;
    height: SizeInput;
    /**
     * Per-child weight for the gap this node contributes to its parent's flex
     * run, `[0, 1]`. See the property's own note — set it to collapse a child
     * without the surrounding gap popping.
     */
    gapScale: number;
    /**
     * Sets `width` and `height` to the same value in one go. Pure sugar: at
     * construction time, an author-facing `size` is expanded into `width`/
     * `height` before either is applied. Explicit `width` or `height` takes
     * precedence over `size` (mirroring `padding`'s side-vs-shorthand rule),
     * so `{ size: 200, width: 100 }` yields `width: 100, height: 200`.
     * Reactive bindings and `to()`/`set()` targets both work the same as
     * `width`/`height` — `size: 'fill'`, `size: () => ...`, or
     * `node.to({ size: 300 }, 0.5)` are all valid.
     */
    size: SizeInput;
    scale: number;
    rotation: number;
    opacity: number;
    /** Layer blend mode. `'pass-through'` (default) does not isolate the node — its opacity scales each child/fill while they blend against the backdrop. Any other mode isolates the node and blends its flattened result against the backdrop. */
    blend: NodeBlendMode;
    effects: Effect;
    /** Inner spacing between this node's edges and its content/children. */
    padding: Insets;
    /** When true, content drawn outside this node's outline is clipped away (see {@link Node2D.clipSelf}). */
    clip: boolean;
    /**
     * Frame of reference this node lays its **children** out in. `'relative'`
     * (default) positions them inside this node's own content box; `'absolute'`
     * pins them to the stage instead, so their `x`/`y` are scene-root
     * coordinates and this node's `flow`/`gap`/`padding` no longer place them.
     * Overridden per child by {@link relativeToParent}.
     */
    childPositioning: ChildPositioning;
    /**
     * This node's own override of its parent's {@link childPositioning}.
     * `'inherit'` (default) takes whatever the parent declared; `'relative'` and
     * `'absolute'` opt this one node in or out regardless.
     */
    relativeToParent: RelativeToParent;
    /**
     * Pivot point for rotation and scale. Either a **named anchor** (`'center'`,
     * `'topRight'`, `'bottomLeft'`, … — the node `align` vocabulary) or an explicit
     * {@link Vector2}: `(0,0)`=center, `(-1,1)`=top-left, `(1,-1)`=bottom-right. Set
     * automatically when an anchor *positioning* prop is used.
     */
    pivot: Anchor;

    // ---- Mirrors and the third dimension -----------------------------------
    // A node is a flat plane, and these are the CSS transform functions that
    // still apply to one: the two mirrors, the two out-of-plane rotations, a
    // push along the view axis and the perspective that makes it read as depth.
    // `rotation` supplies the Z axis (see `transform3D` for why there is no
    // `rotationZ` beside it), and every one of them turns about `pivot` — or
    // about `transformOrigin`, where that is set.

    /**
     * Mirror the node (and its whole subtree) across its vertical centre line.
     * The same thing CSS's `scaleX(-1)` is: text reads backwards, a left-pointing
     * arrow points right, and nothing about the node's box or its layout moves.
     */
    flipHorizontal: boolean;
    /** Mirror across the horizontal centre line — CSS's `scaleY(-1)`. See {@link flipHorizontal}. */
    flipVertical: boolean;
    /** Tilt about the horizontal axis, in **degrees**. Positive tips the top edge away from the viewer. */
    rotationX: number;
    /** Tilt about the vertical axis, in **degrees**. Positive swings the right edge away from the viewer. */
    rotationY: number;
    /**
     * In-plane rotation belonging to the 3D transform, in **degrees** clockwise —
     * the Z axis of the `rotateX · rotateY · rotateZ` block.
     *
     * **Not a second name for {@link rotation}.** The two are independent numbers
     * and editing one never moves the other. What separates them is which side of
     * the geometry/paint line they fall on: `rotation` turns the node's *shape*,
     * so its box turns with it and everything reading that box follows, while
     * this is part of the projection, which is paint (see `Node2D._localMatrix`).
     * Turning a node with `rotation` turns its selection outline; turning it with
     * `rotationZ` spins the picture inside a box that stays where it was.
     *
     * They compose the only way two rotations about one axis can — they add.
     */
    rotationZ: number;
    /**
     * Push along the view axis, in px — CSS's `translateZ`. Positive brings the
     * node toward the viewer, so it projects larger.
     *
     * **Inert without {@link perspective}.** With no perspective the projection is
     * parallel and z is simply dropped, exactly as in CSS: there is no viewpoint
     * for a thing to be nearer to.
     */
    depth: number;
    /**
     * Distance from the viewer to the plane the node sits in, in px. `0` (the
     * default) is no perspective at all — a parallel projection, where a tilt
     * squashes the node evenly rather than making its far edge recede.
     *
     * Smaller is more dramatic: the node subtends more of the field of view, so
     * the convergence is stronger. Somewhere around 800–1500 reads like a page
     * on a desk; a few hundred reads like a wide-angle lens.
     *
     * Declared per node rather than inherited from an ancestor, which is where
     * CSS puts it. A scene graph has no viewport element to hang it on, and a
     * node that carries its own is one that can be handed around, nested and
     * animated without its depth depending on where it was dropped.
     */
    perspective: number;
    /**
     * Whether the node still paints once it has turned past edge-on and is
     * showing its back — CSS's `backface-visibility`, defaulted the CSS way
     * (`visible`).
     *
     * Set it `false` for the card-flip: two nodes back to back, one at
     * `rotationY: 0` and one at `180`, each hidden exactly while the other faces
     * out. The test is the tilt alone (see `facesAway`) — a {@link flipHorizontal}
     * mirrors the node without turning it around, so it does not hide it.
     */
    backfaceVisible: boolean;
    /**
     * The point every rotation, scale and mirror turns about — CSS's
     * `transform-origin`, in the same `[-1, 1]` vocabulary as {@link pivot}
     * (a named anchor, or a {@link Vector2} where `(0,0)` is the centre).
     *
     * Unset (the default) it *is* the pivot, so a node keeps turning about
     * whatever its anchor positioning gave it and nothing changes. Set, it wins
     * for the whole transform rather than for the 3D half of it — one origin, the
     * way CSS has one. A second origin that only some of the rotations respected
     * would produce a picture nobody could predict.
     */
    transformOrigin: Anchor;
    /**
     * All of the above in one bag — construction sugar, expanded into the
     * individual props before anything reads them (exactly as {@link size} is
     * expanded into `width`/`height`), so `set()`, `to()` and reactive callbacks
     * all behave identically whichever form is used.
     *
     * ```ts
     * <Rect transform3D={{ rotationX: 45, rotationY: -17, perspective: 900 }} />
     * card().to({ transform3D: { rotationY: 180 } }, 0.8)
     * ```
     *
     * `rotationZ` is the block's own in-plane rotation and is **not** the node's
     * {@link rotation} under another name — see its note for what separates them.
     */
    transform3D: NodeTransform3D;

    // ---- Anchor-based positioning -----------------------------------------
    // Pass any one of these instead of (or in addition to) x/y.
    // The node will reactively offset itself so the named anchor lands at the
    // given scene-space position. Callbacks are supported and re-evaluated
    // whenever the referenced value or this node's layout changes.
    center: Vector2 | (() => Vector2);
    topLeft: Vector2 | (() => Vector2);
    topRight: Vector2 | (() => Vector2);
    bottomLeft: Vector2 | (() => Vector2);
    bottomRight: Vector2 | (() => Vector2);
    topCenter: Vector2 | (() => Vector2);
    bottomCenter: Vector2 | (() => Vector2);
    centerLeft: Vector2 | (() => Vector2);
    centerRight: Vector2 | (() => Vector2);

    /**
     * Proportional share of the free space along the parent's main axis,
     * relative to sibling `fill` children (like Flutter's `Expanded(flex:)`).
     * Only meaningful when this node fills the main axis — in a row that's
     * `width:'fill'`, in a column `height:'fill'`. Two siblings with `flex` 2
     * and 1 split the free space 2:1. Defaults to 1. Specifying `flex` without
     * an explicit `width`/`height` defaults both to `'fill'`.
     */
    flex: number;

    // ---- Grid placement (only meaningful when inside a Grid container) -------
    /** 1-based column index for explicit grid placement. Undefined = auto-placed. */
    column: number;
    /** 1-based row index for explicit grid placement. Undefined = auto-placed. */
    row: number;
    /** How many grid columns this child spans. Default 1. */
    colSpan: number;
    /** How many grid rows this child spans. Default 1. */
    rowSpan: number;
}

/**
 * Base class for all scene-graph nodes.
 *
 * Every visible or structural element in a scene extends `Node2D`. It wires
 * together three orthogonal systems:
 *
 * **Reactive properties** — fields declared with `@property()` are backed by
 * `Signal`s. Reading them inside a reactive context (e.g. a render pass)
 * creates a subscription; writing them propagates the change automatically.
 * Use {@link set} to update one or more props imperatively, or pass a callback
 * `() => expr` to bind the prop to a derived value.
 *
 * **Tweening** — `to(props, duration, ease?)` returns a {@link ChainableCommand}
 * that animates one or more props to target values over the given duration (in
 * seconds). It is both a {@link Command} (evaluable at a time via `at(t)`) and
 * iterable, so `yield* node.to(...)` still works. Numeric props are
 * interpolated; props that register a custom `tween` fn (via
 * `@property({ tween })`) can animate any value type. The convenience helpers
 * `moveTo`, `moveX`, `moveY`, `fadeTo`, `rotateTo`, and `scaleTo` wrap `to`
 * for the most common single-property animations.
 *
 * **Layout** — `measure()` is called top-down to resolve sizes, then
 * `layout()` places the node in its allocated `BoxBounds`. Children are
 * measured and laid out by the parent; the base class just stores the rect.
 *
 * ### Built-in visual props
 * | prop      | default  | unit / notes                          |
 * |-----------|----------|---------------------------------------|
 * | `x`       | 0        | horizontal offset in scene pixels     |
 * | `y`       | 0        | vertical offset (positive = up)       |
 * | `width`   | `'fill'` | `SizeInput`: px, `'fill'`, `'auto'`  |
 * | `height`  | `'fill'` | same                                  |
 * | `size`    | —        | sugar: sets `width` and `height` together |
 * | `scale`   | 1        | uniform scale factor                  |
 * | `rotate`  | 0        | degrees, clockwise                    |
 * | `opacity` | 1        | 0–1                                   |
 * | `blend`   | `'pass-through'` | layer blend mode (`NodeBlendMode`) |
 * | `effects` | []       | post-process / blend effects          |
 * | `padding` | 0        | inner spacing, all four edges         |
 */export class Node2D<P extends Node2DProps = Node2DProps> extends Node<P> {
    get dimension(): NodeDimension { return "2d"; }

    /**
     * This node's parent, when that parent is itself 2D.
     *
     * A `Node2D` can only ever be adopted by another `Node2D` (see
     * {@link Node.acceptsChild}), so this is `null` only for a detached node or
     * the root — but it is typed honestly rather than cast, because the base
     * tree holds both dimensions.
     */
    protected get parent2D(): Node2D | null {
        const parent = this._parent;
        return parent instanceof Node2D ? parent : null;
    }

    /**
     * This node's parent, narrowed to the 2D tree.
     *
     * Only a `Node2D` can adopt a `Node2D` (see {@link Node.acceptsChild}), so
     * this never hides a real parent — it just spares every 2D caller a cast.
     */
    override get parent(): Node2D | null {
        return this.parent2D;
    }

    /**
     * This node's children **in the 2D tree**.
     *
     * `Canvas3D` is the one node that holds both dimensions, and its `Node3D`
     * children are not part of the 2D tree — they describe a scene it paints,
     * not boxes it lays out — so they are reached through its own accessor
     * instead. Every other node's list is already 2D, and this returns the live
     * array untouched in that case rather than allocating a copy per read.
     */
    override get children(): Node2D[] {
        const all = this._children;
        for (let i = 0; i < all.length; i++) {
            if (!(all[i] instanceof Node2D)) {
                return all.filter((c): c is Node2D => c instanceof Node2D);
            }
        }
        return all as Node2D[];
    }

    constructor(props?: NodeConfig<any, P>) {
        super(props);

        // Expand the `size` and `transform3D` sugar into the props they name
        // before anything reads either — in place, so the single object `super()`
        // retained as `_props` already carries the expanded values.
        if (props) {
            expandSize(props as Record<string, unknown>);
            expandTransform3D(props as Record<string, unknown>);
        }

        // `layoutRect` is a cell like any prop, and a node whose box moved has to
        // redraw — so it reports to the same place. Wired here rather than at the
        // field initializer because `markDirty` is an instance method.
        this._layoutRect.owner = this;

        // Fires the ref, adopts the seed, and applies every `@property` default.
        // Deferred to here rather than run by `super()` because the cells those
        // props write into are this class's own fields, and a subclass's field
        // initializers only run once `super()` has returned.
        this.initProps(props);

        // Specifying `flex` signals intent to fill the parent's main axis, so an
        // unspecified width/height defaults to 'fill' (flex is a no-op on a
        // fixed/hug axis) and skips the has-children default below.
        if (props && (props as any).flex !== undefined) {
            if (props.width === undefined) this.applyProp("width", "fill", { tween: lerpSizeInput });
            if (props.height === undefined) this.applyProp("height", "fill", { tween: lerpSizeInput });
        } else {
            this.applyDefaultSize(props);
        }

        // Anchor-based positioning: validate, derive pivot, bind x/y. The pivot
        // and centre offset math lives in anchor-resolve.ts (shared with the
        // `to()` path); here we use its reactive binding form.
        if (props) {
            validateAnchorProps(props as Record<string, unknown>);
            const anchorKey = findAnchorKey(props as Record<string, unknown>);
            if (anchorKey) {
                const raw = (props as any)[anchorKey] as Vector2 | (() => Vector2);
                const getTarget: () => Vector2 = typeof raw === 'function' ? raw : () => raw;
                const { pivot, x, y } = bindAnchorTarget(anchorKey, getTarget, () => this._layoutRect.get());
                this._writeProp('pivot', pivot);
                this._writeProp('x', x);
                this._writeProp('y', y);
            }
        }

        this.adoptChildrenProp(props);
    }

    /**
     * The 2D half of `set()`: `size` and `transform3D` are sugar with no signal of
     * their own, so they are distributed into the props that do have one before
     * the generic write loop runs.
     */
    override set(props: { [K in keyof P]?: P[K] | (() => P[K]) }): void {
        // `size` has no signal of its own — it's sugar written straight to
        // width/height (explicit width/height in the same call still wins).
        const sizeVal = (props as any).size;
        // Same for `transform3D`, but expanded up front rather than after the
        // loop: its fields are real signals, so distributing them into `props`
        // first means the generic loop writes them like any other key. Only the
        // present-and-an-object case allocates, which is the rare one.
        if ((props as any).transform3D !== undefined) {
            props = { ...props };
            expandTransform3D(props as Record<string, unknown>);
        }
        super.set(props);
        if (sizeVal !== undefined) {
            if ((props as any).width === undefined) this._writeProp('width', sizeVal);
            if ((props as any).height === undefined) this._writeProp('height', sizeVal);
        }
    }

    /**
     * The 2D half of `_prepareStep`: expand the positional sugar into the props
     * that actually have cells, then let the base resolve the step.
     *
     * `to` is mutated in place, so the base sees the expanded target — which is
     * why this can run entirely before `super`.
     */
    override _prepareStep(to: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper {
        // `size` has no signal of its own — expand it into width/height targets
        // before anchor validation and the per-key tween setup below see it.
        // `transform3D` is sugar in the same way, so it expands here too and its
        // fields tween individually, exactly as if they had been named directly.
        expandSize(to as Record<string, unknown>);
        expandTransform3D(to as Record<string, unknown>);

        validateAnchorProps(to as Record<string, unknown>);

        // If an anchor key is in the tween target, resolve it to x/y targets and
        // set pivot (one-shot form of the shared anchor math in anchor-resolve.ts).
        const anchorKey = findAnchorKey(to as Record<string, unknown>);
        if (anchorKey) {
            const raw = (to as any)[anchorKey] as Vector2;
            const { pivot, x, y } = resolveAnchorTargetOnce(anchorKey, this._layoutRect.get(), raw);
            this._writeProp('pivot', pivot);
            (to as any).x = x;
            (to as any).y = y;
        }

        return super._prepareStep(to, duration, easing);
    }

    /**
     * Declare this node's `effects`. {@link ShapeNode} extends it with
     * `fill`/`overlay`/`stroke`/`shadow`, so most nodes never override this at
     * all — only one that paints something its attributes don't describe (a raw
     * `Graphics2D` built from a literal src) has anything to add.
     */
    override prepareRender(tracker: AssetTracker): void {
        const effects = this.effects as SceneEffect[];
        if (effects.length === 0) return;
        const rect = this.layoutRect;
        for (const effect of effects) {
            prepareEffect(effect, tracker, rect?.width ?? 0, rect?.height ?? 0);
        }
    }

    /** Sample this node's own derived render state for the current frame. */
    protected override _sample(): void {
        this._sampleMotion();
    }

    /**
     * Record the subtree's current positions as the motion history's previous
     * frame, stamped `at`, deriving no velocity — see the base's note.
     */
    override primeMotion(at: number): void {
        const r = this.layoutRect;
        primeMotion(
            this._motionHistory,
            (r?.x ?? 0) + this.x,
            (r?.y ?? 0) - this.y,
            this.rotation,
            this.scale,
            at,
        );
        super.primeMotion(at);
    }

    // ---- Visual properties ------------------------------------------------

    @property({ default: 0 }) declare x: number;
    @property({ default: 0 }) declare y: number;
    @property({ default: 'fill', tween: lerpSizeInput }) declare width: SizeInput;
    @property({ default: 'fill', tween: lerpSizeInput }) declare height: SizeInput;
    @property({ default: 1 }) declare scale: number;
    @property({ default: 0 }) declare rotation: number;
    @property({ default: 1 }) declare opacity: number;
    @property({ default: 'pass-through' }) declare blend: NodeBlendMode;
    @effectsProperty() declare effects: Effect;
    @insetsProperty() declare padding: Insets;

    @anchorProperty()
    declare readonly pivot: Anchor;

    // ---- Mirrors and the third dimension -----------------------------------
    // See the matching entries on Node2DProps for what each one means. Plain
    // numeric cells, so they tween like x/y/rotation do; the booleans snap at the
    // end of a tween the way every other discrete cell does.

    /** Mirror across the vertical centre line. See {@link Node2DProps.flipHorizontal}. */
    @property({ default: false }) declare flipHorizontal: boolean;
    /** Mirror across the horizontal centre line. See {@link Node2DProps.flipVertical}. */
    @property({ default: false }) declare flipVertical: boolean;
    /** Tilt about the horizontal axis, degrees. See {@link Node2DProps.rotationX}. */
    @property({ default: 0 }) declare rotationX: number;
    /** Tilt about the vertical axis, degrees. See {@link Node2DProps.rotationY}. */
    @property({ default: 0 }) declare rotationY: number;
    /** The 3D block's in-plane rotation, degrees — distinct from {@link rotation}. See {@link Node2DProps.rotationZ}. */
    @property({ default: 0 }) declare rotationZ: number;
    /** Push along the view axis, px. See {@link Node2DProps.depth}. */
    @property({ default: 0 }) declare depth: number;
    /** Viewer distance in px; `0` is a parallel projection. See {@link Node2DProps.perspective}. */
    @property({ default: 0 }) declare perspective: number;
    /** Whether the node paints while showing its back. See {@link Node2DProps.backfaceVisible}. */
    @property({ default: true }) declare backfaceVisible: boolean;
    /**
     * The point the transform turns about, overriding {@link pivot}. See
     * {@link Node2DProps.transformOrigin}.
     *
     * `undefined` until set — that absence *is* "follow the pivot", which no
     * default value could say, since every anchor is a real point including the
     * centre. Same shape as the `column`/`row` cells above. Declared with the raw
     * decorator rather than `@anchorProperty()` for exactly that reason: that one
     * folds a missing `default` back onto `'center'`.
     */
    @property<Anchor | undefined, Vector2 | undefined>({
        default: undefined,
        mapper: (v) => (v === undefined ? undefined : resolveAnchor(v)),
        // Tweening *into* an origin from "no origin set" starts where it ends —
        // there is no point to travel from, and snapping to the target's own
        // start is the one reading that isn't an invented one.
        tween: (from, to, t) => lerpAnchor(from ?? to ?? ORIGIN_2D, to ?? ORIGIN_2D, t),
    })
    declare transformOrigin: Anchor | undefined;

    /** When true, content drawn by this node's children is clipped to its outline (see {@link clipSelf}). */
    @property({ default: false }) declare clip: boolean;

    // ---- Positioning frame ------------------------------------------------
    // Plain string cells: both are discrete modes, so `to()` snaps them at the
    // end of a tween rather than interpolating — there is nothing between
    // "laid out by my parent" and "pinned to the stage".

    /** Frame of reference this node's children are placed in. See {@link Node2DProps.childPositioning}. */
    @property({ default: 'relative' }) declare childPositioning: ChildPositioning;
    /** This node's override of its parent's `childPositioning`. See {@link Node2DProps.relativeToParent}. */
    @property({ default: 'inherit' }) declare relativeToParent: RelativeToParent;

    @property({ default: 1 }) declare flex: number;
    /**
     * Per-child weight for the flex gap this node contributes to its parent's
     * main axis, in `[0, 1]`. Default `1` = a full gap on each side (normal
     * layout). Driven `0 → 1` (insert) / `1 → 0` (remove) by the animated
     * `addChildAt`/`removeChildAt` overloads so the surrounding gap opens/closes
     * in lockstep with the child's box instead of popping — see
     * {@link addChildAtAnimated}. Read only by flex containers off their
     * children.
     *
     * Rarely set by hand, but it has to be *settable*: a host collapsing a child
     * in place rather than removing it — which is what makes a show/hide a value
     * a time can produce instead of an effect that has to have run — needs the
     * gap to close with it. Declared on {@link Node2DProps} for that reason; it
     * used to be reachable only through a cast, which is why the lifecycle
     * helpers carry one.
     */
    @property({ default: 1 }) declare gapScale: number;
    @property({ default: undefined }) declare column: number | undefined;
    @property({ default: undefined }) declare row: number | undefined;
    @property({ default: 1 }) declare colSpan: number;
    @property({ default: 1 }) declare rowSpan: number;

    private readonly _layoutRect = new Signal<BoxBounds>({ x: 0, y: 0, width: 0, height: 0 });
    protected constraints!: SizeConstraints;

    /**
     * The {@link Measurer} threaded through the last {@link measure} pass,
     * retained so off-tree work (e.g. the animated child-insert in
     * `node-lifecycle.ts`) can measure a not-yet-attached child in isolation —
     * measuring its natural size without adding it to this node's layout flow, so
     * siblings don't shift for a frame. Undefined until this node is first
     * measured. `@internal`.
     */
    _lastScope?: Measurer;

    /** The allocated bounding box from the last layout pass. Reactive — reads inside callbacks are tracked. */
    protected get layoutRect(): BoxBounds { return this._layoutRect.get(); }

    /**
     * The allocated layout cell, exposed for the picking walk in
     * `runtime/node-picking.ts` — it needs a camera node's viewport rect, which
     * is `layoutRect` and nothing else. `@internal`; authors read
     * `measuredWidth`/`measuredHeight`/`global`.
     */
    /** @internal */
    get measuredRect(): BoxBounds { return this.layoutRect; }

    /**
     * {@link flattenChildrenProp}, narrowed to the children this node will
     * actually lay out — a stage-pinned child (see
     * {@link Node2DProps.childPositioning}) is neither measured against this box
     * nor placed in its flow, so it can't inform the size defaults either.
     *
     * Reads the raw `childPositioning` off `props` rather than `this`, because
     * {@link applyDefaultSize} runs from the constructor before the prop cells
     * are applied. Each child's own `relativeToParent` *is* already resolved —
     * JSX children are fully constructed before they arrive here.
     */
    protected static flowChildrenProp(
        props: ({ children?: unknown; childPositioning?: unknown }) | undefined,
    ): Node2D[] {
        const raw = props?.childPositioning;
        const parentDefault: ChildPositioning = raw === "absolute" ? "absolute" : "relative";
        return Node2D.flattenChildrenProp(props).filter(
            (c): c is Node2D =>
                c instanceof Node2D
                && resolvePositioning(c.relativeToParent, parentDefault) === "relative",
        );
    }

    /**
     * True if any of `children` requests `"fill"` on `axis` — the signal a
     * container's {@link applyDefaultSize} override uses to decide whether its
     * own hug default on that axis would strand the child with no space to
     * fill into (see {@link Rect}/{@link FlexNode} overrides).
     */
    protected static hasFillChild(children: Node2D[], axis: "width" | "height"): boolean {
        return children.some((c) => (axis === "width" ? c.width : c.height) === "fill");
    }

    /**
     * Figma-style smart default for `width`/`height`: hug-to-content when the
     * node is given children, fill-the-parent when it's empty — so a plain
     * `new Rect({ children: [...] })` shrink-wraps like a Figma auto-layout
     * frame, while an empty one behaves like a background/spacer. Called once
     * from the constructor (skipped when `flex` is set, since that already
     * implies 'fill'), so it's the baseline every `Node2D` gets for free.
     *
     * Subclasses with their own sizing convention (`Text` hugs single-line
     * text but fills when wrapping/autofit; `Path`/`RichText` always hug;
     * `FlexNode` always hugs) override this — typically a one-line replacement
     * — instead of duplicating the children-check in their constructor.
     *
     * "Given children" means children in this node's *flow*: a container holding
     * nothing but stage-pinned children has no content of its own to shrink-wrap,
     * so it defaults like an empty one.
     */
    protected applyDefaultSize(props?: NodeConfig<any, P>): void {
        const hasChildren = Node2D.flowChildrenProp(props).length > 0;
        const defaultSize = hasChildren ? "hug" : "fill";
        if (!props || props.width === undefined) this.applyProp("width", defaultSize, { tween: lerpSizeInput });
        if (!props || props.height === undefined) this.applyProp("height", defaultSize, { tween: lerpSizeInput });
    }

    // ---- Motion helpers ---------------------------------------------------
    //
    // Each returns the `Command` it delegates to rather than wrapping it in a
    // generator. `yield*` still works — a `Command` is iterable — but a
    // generator wrapper would discard the thing worth having: a `Command` can
    // be *evaluated* at a time, and a generator around it can only be advanced.

    /**
     * Animate both `x` and `y` to the given position.
     *
     * @example
     * yield* node.moveTo(200, 100, 0.5, ease.outCubic);
     */
    moveTo(x: number, y: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ x, y } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the horizontal position (`x`).
     *
     * @example
     * yield* node.moveX(300, 0.4);
     */
    moveX(x: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ x } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the vertical position (`y`).
     *
     * @example
     * yield* node.moveY(-50, 0.4);
     */
    moveY(y: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ y } as Partial<P>, duration, ease);
    }

    /**
     * Animate `opacity` to the target value.
     *
     * @param opacity Target opacity in the range `[0, 1]`.
     * @example
     * yield* node.fadeTo(0, 0.3);   // fade out
     * yield* node.fadeTo(1, 0.3);   // fade in
     */
    fadeTo(opacity: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ opacity } as Partial<P>, duration, ease);
    }

    /**
     * Animate `rotate` to the target angle (degrees, clockwise).
     *
     * @example
     * yield* node.rotateTo(180, 0.6, ease.inOutQuad);
     */
    rotateTo(rotation: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ rotation } as Partial<P>, duration, ease);
    }

    /**
     * Animate `scale` to the target factor.
     *
     * @example
     * yield* node.scaleTo(1.5, 0.4);   // grow
     * yield* node.scaleTo(0,   0.3);   // shrink to nothing
     */
    scaleTo(scale: number, duration: number, ease?: EasingFunction): ChainableCommand<P> {
        return this.to({ scale } as Partial<P>, duration, ease);
    }

    /**
     * Continuously jitter one or more numeric props around their **current**
     * values for `duration` seconds, then settle them back exactly where they
     * started.
     *
     * The target reads like {@link to} — an object of prop → *amplitude* rather
     * than prop → target — so you name props as typed object keys, never string
     * arguments, and can jitter several at once: `wiggle({ x: 8, rotation: 2 },
     * 0.6)`. Each value is the peak offset from that prop's base, in the prop's
     * own units. Call-wide shaping (`frequency`, `settle`) goes in the trailing
     * {@link WiggleOptions} bag, mirroring how `TweenOptions` bundles its knobs.
     *
     * Unlike `to()`, which drives a prop *to* a target, `wiggle` adds an organic
     * offset on top of a fixed base — each prop's value at the moment the
     * generator starts. Offsets are drawn from this node's seeded {@link random}
     * `noise` field, so they are *correlated over time* (nearby frames get
     * nearby offsets) rather than the jagged jumps independent draws would give
     * — the difference that makes it read as hand-held shake / drift rather than
     * static. Because the source is seeded per node, the motion is reproducible
     * across scrub / precomp / HMR out of the box.
     *
     * The offset rides on each prop's *stored* numeric value, so raw props
     * (`x`, `rotation`, …) and mapped props that resolve to a plain number both
     * wiggle correctly. A prop whose stored value isn't a number — `width:
     * 'fill'`, or a per-corner `cornerRadius` object — has no scalar to offset,
     * so it's skipped with a dev-time warning rather than producing `NaN`.
     *
     * The bases are captured once, so `wiggle` composes: run it inside
     * {@link parallel} alongside a `to()` on *other* props, or give sibling nodes
     * distinct seeds (via the {@link Node2DProps.seed} prop) so a crowd wiggles out
     * of phase. Every prop's offset eases to zero over the final `settle` fraction
     * so it lands back on its base without a visible snap.
     *
     * @param amplitudes Map of prop → peak offset from its base, in the prop's
     *                   own units. Same key shape as {@link to}'s target
     *                   (`{ x, y, rotation, … }`).
     * @param duration   Seconds to wiggle for. Pass `Infinity` inside a
     *                   {@link parallel} for an endless jitter bounded by its
     *                   siblings (no settle is applied to an infinite wiggle).
     * @param options    Call-wide {@link WiggleOptions}: `frequency` (default
     *                   `4`) and `settle`. `frequency` applies to every prop; for
     *                   a per-prop rate, use a second `wiggle` in the same
     *                   `parallel`.
     *
     * @example
     * // Shake horizontally for a beat, then rest exactly where it began:
     * yield* node.wiggle({ x: 8 }, 0.6);
     *
     * @example
     * // A faster shake with a hard cut (no ease-out) at the end:
     * yield* node.wiggle({ x: 12, y: 12 }, 1, { frequency: 8, settle: 0 });
     *
     * @example
     * // Hand-held drift while it moves across (offset composes with the move):
     * yield* parallel(
     *   node.moveX(400, 2),
     *   node.wiggle({ y: 6, rotation: 2 }, 2, { frequency: 3 }),
     * );
     */
    wiggle(
        amplitudes: { [K in keyof P]?: number },
        duration: number,
        options?: WiggleOptions,
    ): Command<Record<string, never>> {
        const frequency = options?.frequency ?? 4;
        // The ease-out window: `settle` overrides, else a short fraction of the
        // run, capped so a very short wiggle still spends most of its time
        // actually wiggling, and zero for an unbounded (Infinity) wiggle — there's
        // no end to ease toward.
        const settle = options?.settle ?? (Number.isFinite(duration) && duration > 0
            ? Math.min(0.25, 0.15 / duration)
            : 0);

        // Resolve each key to its numeric cell + captured base, lazily on first
        // evaluation rather than now — mirroring the generator this replaces,
        // whose body (including this resolution loop) never ran a line until
        // the caller's first `.next()`. `base` is captured at that point so the
        // jitter rides on top of wherever the prop is *then*, which is what
        // lets wiggle compose with a concurrent to() on a different prop and
        // keeps it from reading a stale base if the caller mutates the node
        // between calling `wiggle()` and actually driving it.
        //
        // The offset is applied in the prop's *stored* space via `cell.set` — a
        // mapped numeric prop (a clamp / scale mapper) stores a number, so the
        // wiggle rides on the resolved value directly; that also sidesteps the
        // double-mapping a setter write would cause (the mapper is one-way, so
        // there's no author-space base to recover). A prop whose stored value
        // isn't a plain number — `width: 'fill'`, or a per-corner `cornerRadius`
        // object — has no scalar to offset, so it's skipped with a dev warning.
        interface WiggleTarget { cell: Signal<number>; base: number; amplitude: number; phase: number; }
        const node = this;
        let resolved: WiggleTarget[] | null = null;
        const resolveTargets = (): WiggleTarget[] => {
            if (resolved) return resolved;
            const out: WiggleTarget[] = [];
            for (const key in amplitudes) {
                const amplitude = amplitudes[key];
                if (amplitude === undefined) continue;

                const cell = node.__signals?.get(key) as Signal<number> | undefined;
                const base = cell?.get();
                if (!cell || typeof base !== 'number') {
                    if (cell) {
                        console.warn(`Node2D.wiggle: prop "${key}" isn't a plain number (got ${typeof base}); skipping. wiggle only offsets numeric props.`);
                    }
                    continue;
                }

                out.push({
                    cell,
                    base,
                    amplitude,
                    // Give each prop its own region of the noise field so props
                    // wiggled together (x + y) draw independent curves instead
                    // of moving in lockstep. A per-key hash — not `key.length`,
                    // which collides for same-length names like x/y — spreads
                    // the sample points far apart, past any overlap for a
                    // realistic run.
                    phase: wigglePhase(key),
                });
            }
            resolved = out;
            return out;
        };
        const random = this.random;

        /** Write every target's offset for `elapsed` seconds in. */
        const apply = (elapsed: number): void => {
            const targets = resolveTargets();
            const t = duration > 0 && Number.isFinite(duration) ? elapsed / duration : 0;
            // Ease every offset to zero over the final `settle` window.
            const fade = settle > 0 && t > 1 - settle ? (1 - t) / settle : 1;
            for (const target of targets) {
                // noise() returns [0, 1]; remap to [-1, 1] for a symmetric swing
                // around the base.
                const swing = random.noise(target.phase + elapsed, frequency) * 2 - 1;
                target.cell.set(target.base + swing * target.amplitude * fade);
            }
        };
        /** Land exactly on the bases — no residual offset from the last frame. */
        const settleToBase = (): void => {
            for (const target of resolveTargets()) target.cell.set(target.base);
        };

        // `duration` can be `Infinity` (an unbounded wiggle, bounded only by its
        // siblings in a `parallel`) — normalized time collapses to zero for any
        // finite elapsed against an infinite duration, so this is driven by raw
        // elapsed seconds rather than `driveCommand`'s normalized `t`. `at(t)` is
        // therefore only exactly evaluable for a finite duration; for an infinite
        // one it can only distinguish "settled" (`t>=1`) from "running" (`t<1`,
        // sampled at `elapsed=0`) — an unbounded wiggle was never a value a driven
        // host could ask about at an arbitrary time anyway.
        return {
            duration,
            at(t: number): Record<string, never> {
                if (t >= 1) { settleToBase(); return {}; }
                apply(Number.isFinite(duration) ? Math.max(0, t) * duration : 0);
                return {};
            },
            _stepper(): TweenStepper {
                let elapsed = 0;
                return {
                    seek: (e: number) => {
                        elapsed = e;
                        if (Number.isFinite(duration) && e >= duration) settleToBase();
                        else apply(e);
                    },
                    advance: (dt: number): boolean => {
                        elapsed += dt;
                        const done = Number.isFinite(duration) && elapsed >= duration;
                        if (done) settleToBase(); else apply(elapsed);
                        return done;
                    },
                };
            },
            [Symbol.iterator](): Iterator<void, void, number> {
                const step = this._stepper();
                return (function* (): FrameGenerator {
                    step.seek(0);
                    let done = false;
                    while (!done) {
                        const dt = yield;
                        done = step.advance(dt);
                    }
                })();
            },
        };
    }

    // ---- Layout queries ---------------------------------------------------

    get measuredWidth(): number {
        return this.layoutRect.width;
    }

    get measuredHeight(): number {
        return this.layoutRect.height;
    }

    // ---- Anchor points ----------------------------------------------------
    // All getters read the reactive layoutRect signal AND the reactive x/y/rotation
    // signals, so any callback that reads them will re-evaluate on any change.

    /** Rotate offset (ox, oy) by this node's rotation (degrees clockwise) around the node center. */
    private _rotateOffset(ox: number, oy: number): Vector2 {
        return rotateOffset(this.x, this.y, this.rotation, ox, oy);
    }

    /** Center of the node — equivalent to its x/y position (0,0 is the center of the layout cell). */
    get center(): Vector2 {
        return { x: this.x, y: this.y };
    }

    get topLeft(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(-r.width / 2, r.height / 2);
    }

    get topRight(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(r.width / 2, r.height / 2);
    }

    get bottomLeft(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(-r.width / 2, -r.height / 2);
    }

    get bottomRight(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(r.width / 2, -r.height / 2);
    }

    get topCenter(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(0, r.height / 2);
    }

    get bottomCenter(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(0, -r.height / 2);
    }

    get centerLeft(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(-r.width / 2, 0);
    }

    get centerRight(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(r.width / 2, 0);
    }

    // ---- Global (world-space) transform -----------------------------------
    // The local anchor getters above are relative to this node's *parent*; their
    // global counterparts below fold in the full ancestor chain so a node can be
    // aligned to another regardless of where each sits in the tree:
    //   new Rect({ x: () => other().global.x, y: () => other().global.y })
    // All reads are reactive — they track this node's and every ancestor's
    // layout/x/y/rotation/scale/pivot signals.

    /**
     * This node's local transform in canvas (y-down) space — position, rotation,
     * scale, about its origin. Composed with the parent chain by
     * {@link worldMatrix}, and the matrix every world-space *reading* of the node
     * comes from: {@link global}, `runtime/node-picking.ts`, and so any editor
     * overlay drawn on top of a scene.
     *
     * **It is flat, deliberately, and the renderer's is not.** A node that
     * mirrors or tilts ({@link Node2DProps.rotationX}, {@link Node2DProps.perspective},
     * {@link Node2DProps.flipHorizontal}, …) is *painted* through a projected
     * matrix, but goes on measuring, reporting and hit-testing as the upright
     * rectangle it was — see {@link applyTransform}.
     *
     * That is a choice, not an oversight. Everything that reads a node's box
     * reads it to put a handle on: a selection outline, a resize grip, a rotation
     * dial, `other.global.topRight` as an alignment target. Those all mean
     * something on a rectangle and stop meaning it on a trapezoid — a "width"
     * handle on a foreshortened edge does not correspond to any number, and a
     * corner that has swung behind the viewer has no screen position at all.
     * Letting the projection through would make the tilt a thing that quietly
     * breaks every other tool in the editor; keeping the geometry flat makes it
     * exactly what it looks like, a way of drawing the node.
     */
    /** @internal Composed with the camera scopes in between by `runtime/node-picking.ts`. */
    _localMatrix(): Matrix2D {
        const r = this.layoutRect;
        const cx = (r?.x ?? 0) + this.x;
        const cy = (r?.y ?? 0) - this.y;
        // The accessor stores the resolved normalised pivot via the mapper.
        // No projection: see the note above for why a node's *geometry* stays
        // flat while its paint does not.
        return localMatrix(
            cx, cy, this.rotation, this.scale, this._transformOrigin(),
            r?.width ?? 0, r?.height ?? 0,
        );
    }

    /**
     * The point this node's transform turns about, normalised: `transformOrigin`
     * where one is set, the anchor-derived `pivot` otherwise. One resolution,
     * read by {@link _localMatrix} and {@link applyTransform} alike.
     */
    private _transformOrigin(): Vector2 {
        return (this.transformOrigin as Vector2 | undefined) ?? (this.pivot as Vector2);
    }

    // Reused for the same reason `_transformScratch` is: `_localMatrix` runs once
    // per ancestor per `global` read, and the two functions that take a
    // Projection3D read it synchronously and never retain it.
    private readonly _projectionScratch: Projection3D = {
        rotationX: 0, rotationY: 0, rotationZ: 0, depth: 0, perspective: 0,
        flipHorizontal: false, flipVertical: false,
    };

    /** This node's out-of-plane fields, gathered for the matrix builders. */
    private _projection(): Projection3D {
        const p = this._projectionScratch;
        p.rotationX = this.rotationX;
        p.rotationY = this.rotationY;
        p.rotationZ = this.rotationZ;
        p.depth = this.depth;
        p.perspective = this.perspective;
        p.flipHorizontal = this.flipHorizontal;
        p.flipVertical = this.flipVertical;
        return p;
    }

    /**
     * This node's full transform in canvas (y-down) world space — the product of
     * every ancestor's local matrix from the root down to this node. Reactive:
     * walks the live parent chain and reads each node's transform signals.
     */
    protected worldMatrix(): Matrix2D {
        const local = this._localMatrix();
        const parent = this.parent2D;
        return parent ? multiply(parent.worldMatrix(), local) : local;
    }

    /**
     * Resolved world-space transform — the same anchor points and metrics as the
     * local getters (`center`, `topRight`, `rotation`, …) but folded through the
     * full ancestor chain, so values are absolute scene coordinates rather than
     * parent-relative ones. See {@link WorldTransform}. Every field is reactive.
     *
     * @example
     * // Read another node's absolute corner, regardless of its parent:
     * const p = other.global.topRight;   // world-space {x, y}
     *
     * ### Reading vs. placing
     * `global` is for *reading* world coordinates. `x`/`y` (and the anchor props)
     * are **parent-relative**, so assigning a world value to them does not by
     * itself place this node in world space — it offsets it from this node's own
     * parent. To land exactly on another node regardless of either parent,
     * subtract this node's parent's world contribution:
     *
     * @example
     * // Place this node's origin exactly on `other`, any parent:
     * new Rect({
     *   x: () => other.global.x - (myParent.global.x),
     *   y: () => other.global.y - (myParent.global.y),
     * });
     *
     * When both nodes share the same parent origin (e.g. both at the scene root),
     * `x: () => other.global.x` already lands on target with no compensation.
     */
    get global(): WorldTransform {
        const r = this.layoutRect;
        const anchors = worldAnchors(this.worldMatrix(), (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);

        // Accumulate ancestor rotation/scale/opacity up the chain (rotation sums,
        // scale and opacity multiply — all match the renderer's nested transforms
        // and its pass-through alpha fold).
        let rotation = 0;
        let scale = 1;
        let opacity = 1;
        for (let n: Node2D | null = this; n; n = n.parent2D) {
            rotation += n.rotation;
            scale *= n.scale;
            opacity *= n.opacity;
        }

        return {
            x: anchors.center.x,
            y: anchors.center.y,
            ...anchors,
            rotation,
            scale,
            opacity,
        };
    }

    isAutoSize(axis: "width" | "height"): boolean {
        return isAutoSize(axis === "width" ? this.width : this.height);
    }

    resolveSizeInput(sizeInput: SizeInput, availableSize: number, childrenSize: number): number {
        return resolveSize(sizeInput, availableSize, childrenSize);
    }

    // Typed to the shared base because that is what JSX produces; the guard below
    // rejects a `Node3D` before it can land in a tree that would never draw it.
    addChildAt(child: Node, index: number): void;
    addChildAt(child: Node, index: number, duration: number, easing?: EasingFunction): Command<Record<string, never>>;
    addChildAt(child: Node, index: number, duration?: number, easing?: EasingFunction): void | Command<Record<string, never>> {
        this.assertAcceptsChild(child);
        if (duration === undefined) {
            this._children.splice(index, 0, child);
            (child as Node2D)._parent = this;
            const assets = this.tryAssets();
            if (assets) child.bindAssets(assets);
            this.bindChildContext(child);
            return;
        }
        // Past the guard, so this is a 2D child: the animated insert measures it
        // off-tree, which only a laid-out node can do.
        return addChildAtAnimated(this, child as Node2D, index, duration, easing);
    }

    removeChildAt(index: number): Node2D | null;
    removeChildAt(index: number, duration: number, easing?: EasingFunction): Command<Record<string, never>>;
    removeChildAt(index: number, duration?: number, easing?: EasingFunction): (Node2D | null) | Command<Record<string, never>> {
        if (duration === undefined) {
            if (index < 0 || index >= this._children.length) return null;
            const [removed] = this._children.splice(index, 1);
            if (removed) (removed as Node2D)._parent = null;
            return (removed as Node2D) ?? null;
        }
        return removeChildAtAnimated(this, index, duration, easing);
    }

    // ---- Rendering --------------------------------------------------------

    // Reused each frame so applyTransform doesn't allocate a fresh descriptor
    // per node per frame. ctx.transform reads it synchronously and never retains
    // it, so a single mutated instance is safe.
    private readonly _transformScratch: TransformState = {
        x: 0, y: 0, width: 0, height: 0,
        scale: 1, rotation: 0, opacity: 1, blend: 'pass-through',
        effects: [], pivot: { x: 0, y: 0 },
    };

    // ---- Motion sampling --------------------------------------------------
    // Per-node motion (velocity/direction/speed/angular/scale) is sampled once
    // per frame from ellapse() (see its call site) as a backward difference
    // against the previous frame. Sampling every advanced frame — not just
    // rendered ones — is what keeps velocity correct through a scrub/rewind,
    // which advances through frames without rendering them. Because ellapse()
    // runs before the frame's generator.next(), x/y here hold the *previous*
    // frame's value, so the velocity trails the rendered position by one frame;
    // the lag is constant and identical forward vs. scrub. Layout-dependent
    // fields (rects) can't be resolved here — layout hasn't run for advanced-
    // but-unrendered frames — so beforeRender() fills those in at draw time,
    // leaving the motion fields untouched.

    /** Rolling history for the backward-difference velocity estimate. Allocated once (not per frame); mutated in place by {@link _sampleMotion}. */
    private readonly _motionHistory: MotionHistory = createMotionHistory();

    /** Reused per-node state handed to `ctx.begin()` (mirrors `_transformScratch`). */
    private readonly _renderState: NodeRenderState = {
        id: this.id,
        rects: {},
        elapsed: 0,
        dt: 0,
        velocity: { x: 0, y: 0 },
        direction: 0,
        speed: 0,
        angularVelocity: 0,
        scaleVelocity: 0,
    };

    /**
     * Compute this frame's motion (velocity/direction/speed/angular/scale) into
     * {@link _renderState} as a backward difference against the previous frame,
     * and roll the history forward. Velocity is `0`/`{0,0}` when no trustworthy
     * delta exists — the first frame, or after a non-monotonic time jump (only
     * `0 < dt <= MAX` is trusted, so a scrub that resets the clock reads as
     * "unknown" rather than a spurious huge velocity). The world position
     * matches {@link applyTransform} (`layoutRect + x`, `layoutRect - y`,
     * y-down). Called via {@link sample} every frame; layout-dependent fields
     * (`rects`/`elapsed`) are filled in by {@link beforeRender} at draw time.
     */
    protected _sampleMotion(): void {
        // Resolve the reactive world position (y-down, matching applyTransform);
        // the backward-difference math lives in sampleMotion (no per-frame alloc).
        const r = this.layoutRect;
        const x = (r?.x ?? 0) + this.x;
        const y = (r?.y ?? 0) - this.y;
        sampleMotion(this._renderState, this._motionHistory, x, y, this.rotation, this.scale, this._clock.time);
    }

    /**
     * Push this node's transform (position, scale, rotate, opacity, effects).
     *
     * The decomposed fields are the whole story for a node in its own plane, and
     * that path is untouched: the backend translates, rotates and scales exactly
     * as it always has. A node that mirrors or tilts hands over a precomposed
     * {@link TransformState.matrix} instead, built by the same `localMatrix`
     * {@link _localMatrix} calls — with the out-of-plane half switched on.
     *
     * **This is the one place that half is applied.** The mirrors and the tilt
     * are paint, not geometry: the node goes on measuring and hit-testing as the
     * upright rectangle it was, and only what is drawn is projected. See
     * {@link _localMatrix} for why.
     */
    protected applyTransform(ctx: RenderContext2D): void {
        const r = this.layoutRect;
        const s = this._transformScratch;
        s.x = (r?.x ?? 0) + this.x;
        s.y = (r?.y ?? 0) - this.y;
        s.width = r?.width ?? 0;
        s.height = r?.height ?? 0;
        s.scale = this.scale;
        s.rotation = this.rotation;
        s.opacity = this.opacity;
        s.blend = this.blend;
        s.effects = this.effects as SceneEffect[];
        s.pivot = this._transformOrigin();
        const projection = this._projection();
        s.matrix = hasProjection3D(projection)
            ? localMatrix(s.x, s.y, s.rotation, s.scale, s.pivot, s.width, s.height, projection)
            : undefined;
        ctx.transform(s);
    }

    /**
     * Hook for custom nodes that draw their own content (raw `Graphics2D`
     * commands, etc.) without subclassing {@link ShapeNode}. Called from
     * `onRender` between the transform push and the children render, the same
     * slot `ShapeNode.renderSelf` occupies. No-op by default — drawing nothing
     * here doesn't change the render flow at all.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` (not `_ctx`) so overriders see the real param name
    protected renderSelf(ctx: RenderContext2D): void { }

    /**
     * Paint the node's `overlay` layer — over its own fill *and* its children,
     * but under the stroke — clipped to the node's silhouette. Called from
     * `onRender` after children render and before {@link renderStroke}. No-op by
     * default; {@link ShapeNode} paints the resolved overlay as a fill of its
     * silhouette so a texture (e.g. VHS grain) sits over the whole subtree.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` so overriders see the real param name
    protected renderOverlay(ctx: RenderContext2D): void { }

    /**
     * Paint the node's stroke last — over its fill, children, and overlay.
     * Deferred out of {@link renderSelf} (which now draws only shadow+fill) so
     * the stroke frames the whole subtree and sits above any overlay. Called
     * from `onRender` after {@link renderOverlay}. No-op by default; {@link
     * ShapeNode} strokes its silhouette.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` so overriders see the real param name
    protected renderStroke(ctx: RenderContext2D): void { }

    /**
     * This node's outline as a {@link Clip} command list — the single source of
     * truth for every clip the node needs: its `clip` boundary (when `clip` is
     * true) and the silhouette its backdrop effects (backdrop-flagged filters,
     * magnify) are confined to. Returning `null` (the default) means the node has
     * no clip outline, so its children render unclipped and it gets no backdrop
     * effects. Nodes with a definite box (shapes via {@link ShapeNode}, layout
     * containers like {@link FlexNode}) override this to describe their geometry —
     * and so behave the same way for `clip` and effect area.
     */
    protected clipSelf(): Clip | null { return null; }

    /**
     * The camera scope this node pushes around its **children** (`beginCamera`),
     * or `null` when it pushes none. Only {@link RootNode} and `Camera` override
     * it, and each returns non-null exactly when its `renderChildren` actually
     * opens a camera — so a consumer can reproduce the renderer's transform *and*
     * its viewport clip without knowing which classes have a camera.
     *
     * Read by `runtime/node-picking.ts`: a camera is applied at render time only,
     * so it is not part of {@link worldMatrix}, and a node's on-screen box would
     * be offset without it. `@internal`.
     */
    /** @internal */
    _cameraScope(): CameraScope | null { return null; }

    /**
     * Whether the renderer confines this node's children to its own box — either
     * because `clip` is set *and* the node has an outline to clip to (a bare
     * `clip` with no {@link clipSelf} is a no-op, see {@link applyClip}), or
     * because it opens a camera scope, which clips to the viewport rect.
     *
     * Read by `runtime/node-picking.ts`: a point outside a confining node cannot
     * hit anything inside it, so the whole subtree is skipped. `@internal`.
     */
    /** @internal */
    _confinesChildren(): boolean {
        if (this._cameraScope() !== null) return true;
        if (!this.clip) return false;
        const clip = this.clipSelf();
        return clip !== null && !clip.isEmpty();
    }

    /**
     * Whether `local` — a point in this node's local space (centred on the node,
     * y-up, rotation and scale already removed) — is inside the node, within
     * `tolerance` scene units of its edge.
     *
     * The default is the layout box, which is the right answer for containers,
     * text, and media: their box *is* their extent. {@link ShapeNode} narrows it
     * to the node's declared {@link clipSelf} outline. Custom nodes that draw
     * their own content can override this so selection follows what they actually
     * paint.
     *
     * `tolerance` is grab-slop, applied outward. An editor passes its
     * zoom-corrected pixel slop so the grab area stays constant on screen
     * regardless of preview zoom.
     */
    protected hitTestSelf(local: Vector2, tolerance: number): boolean {
        const b = this._localBounds();
        return Math.abs(local.x - b.x) <= b.width / 2 + tolerance
            && Math.abs(local.y - b.y) <= b.height / 2 + tolerance;
    }

    /**
     * The extent of this node's ink in its own local space — what an editor draws
     * a selection box around, and the region the default {@link hitTestSelf}
     * grabs.
     *
     * The returned {@link BoxBounds} is **y-up and relative to the node's own
     * centre**: `x`/`y` are where the ink's centre sits relative to the node,
     * normally `(0, 0)`. That is a different space from `layoutRect`, which is
     * the same type but canvas y-down and relative to the parent — see
     * `BoxBounds`, which deliberately does not encode a space.
     *
     * Defaults to the layout box, centred on the node, which is right for every
     * node whose drawing fills its cell. It is a separate seam from the layout
     * rect because for some nodes the two genuinely differ: a {@link Line}'s
     * `points` are drawn relative to its centre and never reach the layout engine,
     * so its ink can be both a different size *and* off-centre. Overriding this
     * fixes the box and the grab region together, without perturbing layout —
     * which a `measure()` override would.
     *
     * `@internal`; override it on a custom node whose drawing is not its cell.
     */
    /** @internal */
    _localBounds(): BoxBounds {
        return { x: 0, y: 0, width: this.measuredWidth, height: this.measuredHeight };
    }

    /** @internal Dispatch seam so `node-picking.ts` can reach the protected override. */
    _hitTestSelf(local: Vector2, tolerance: number): boolean {
        return this.hitTestSelf(local, tolerance);
    }

    /**
     * An optional clip path that cuts through this node's *own* content **and**
     * its children — unlike {@link clip}, which only confines children to the
     * node's outline and leaves the node's own fill/stroke untouched. Returning
     * `null` (the default) applies no such cut. Media nodes (Image, Video) expose
     * this as an author-facing `clipPath` prop so a path can carve the painted
     * frame and everything stacked on it as one.
     */
    protected clipPathSelf(): Clip | null { return null; }

    /**
     * Open `clipSelf()`'s outline as a clip scope, confining whatever is drawn
     * until the matching `ctx.endClip()` to the shape. Returns `true` when a
     * clip was actually opened (so the caller knows to close it) and `false`
     * when the node has no outline (the default).
     */
    protected applyClip(ctx: RenderContext2D): boolean {
        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return false;
        ctx.beginClip(clip);
        return true;
    }

    /**
     * Apply backdrop effects (any `mode: "backdrop"` effect — blur, grayscale, …;
     * plus magnify and backdrop SkSL) beneath this node, clipped to its
     * silhouette, before the node's own content is drawn — so the content
     * underneath is filtered/warped while the node's own edges stay sharp. One
     * backdrop effect scope, confined to the silhouette clip, runs the lot; the
     * renderer routes each effect to a filter or shader pass. A no-op for nodes
     * without a {@link clipSelf} outline (there's no silhouette to confine to).
     */
    private applyBackdropEffects(ctx: RenderContext2D): void {
        const effects = this.effects as SceneEffect[];
        // Bail before building the silhouette. `applyBackdropEffectsImpl` returns
        // immediately when there are no backdrop effects, but by then `clipSelf()`
        // has already allocated a Clip and its op list for a node that will never
        // use it — and a node with no effects at all is the overwhelmingly common
        // case, so that allocation was pure waste on nearly every node, every frame.
        if (effects.length === 0) return;
        applyBackdropEffectsImpl(ctx, effects, this.clipSelf(), this.layoutRect?.width ?? 0, this.layoutRect?.height ?? 0);
    }

    /**
     * Run `body` (this node's own painting + children) inside the node's effect
     * and clip-path scopes — the shared content-rendering envelope every node
     * uses so effects behave identically regardless of how a node draws. The
     * caller is expected to have already pushed the node's transform
     * ({@link applyTransform}). The envelope, outermost-first:
     *
     *  1. {@link applyBackdropEffects} — filters/warps the backdrop beneath the
     *     node, confined to its {@link clipSelf} silhouette.
     *  2. A `foreground` effect scope (posterize wrapping bulge) capturing
     *     everything `body` paints, so those shader effects warp/band the lot.
     *  3. A {@link clipPathSelf} clip cutting through both the node's own paint
     *     and its children.
     *
     * Nodes with a bespoke `onRender` (boolean, mask, …) call this with their
     * custom body to gain the same effect support as a standard shape, instead
     * of duplicating the scope bookkeeping.
     */
    protected renderContentWithEffects(ctx: RenderContext2D, body: () => void): void {
        this.applyBackdropEffects(ctx);
        applyContentEffectScope(ctx, this.effects as SceneEffect[], this.clipPathSelf(), this.layoutRect?.width ?? 0, this.layoutRect?.height ?? 0, body);
    }

    onRender(ctx: RenderContext2D): void {
        this.applyTransform(ctx);
        this.renderContentWithEffects(ctx, () => {
            // renderSelf draws shadow + fill only; the stroke is deferred to
            // renderStroke so it frames the children and overlay (see below).
            this.renderSelf(ctx);
            // Confine children to this node's outline. Built once from clipSelf();
            // skipped when the node has no outline (clipped === false) so the
            // endClip() below stays balanced.
            const clipped = this.clip && this.applyClip(ctx);
            this.renderChildren(ctx);
            if (clipped) ctx.endClip();
            // Overlay paints over fill + children, clipped to the silhouette
            // (it's drawn as a fill of the shape). Stroke paints last, over
            // everything, at the layout-rect edge. Both stay inside the
            // foreground effect / clipPath scope opened by renderContentWithEffects,
            // but outside the children-confine clip closed just above.
            this.renderOverlay(ctx);
            this.renderStroke(ctx);
        });
    }

    renderChildren(ctx: RenderContext2D): void {
        for (const child of this._children) if (child instanceof Node2D) child.render(ctx);
    }

    beforeRender(ctx: RenderContext2D): void {
        // Motion fields were already sampled in ellapse() this frame. Only the
        // layout-dependent fields are resolved here, where layout is current.
        const s = this._renderState;
        // Skipped for contexts that never resolve a `space:'parent'` fill — the
        // precomp pass walks every node's render every frame purely to discover
        // assets, and this is an object allocation per node per frame that nothing
        // there would ever read.
        s.rects = ctx.readsSpaceRects ? this._spaceRects() : NO_SPACE_RECTS;
        s.elapsed = this._clock.elapsed;
        ctx.begin(s);
    }

    /**
     * Reference rects for fills with `space:'parent'`, expressed in this node's
     * local space (origin = this node's positioned centre, y-down to match the
     * canvas). The viewport (`space:'global'`) is resolved by the renderer, which
     * knows the surface size. Rotation/scale of this node are not folded in —
     * the rect is the axis-aligned parent box, which is what gradients expect.
     */
    protected _spaceRects(): SpaceRects {
        return computeSpaceRects(this.parent2D?.layoutRect, this.layoutRect, this.x, this.y);
    }

    afterRender(ctx: RenderContext2D): void {
        ctx.end();
    }

    render(ctx: RenderContext2D): void {
        // A subtree at zero opacity paints nothing, so on a context that only
        // draws what can be seen there is no reason to walk it. Not a niche case:
        // a chart carries a full second axis at `opacity: 0` purely to reserve a
        // gutter, and every cross-fade spends its first and last frames here.
        //
        // `drawsVisibleOnly` is false on the tracking walk, which must still
        // descend — an invisible node's font and images have to be discovered or
        // they will not have loaded by the time it fades in. See the flag's doc.
        if (ctx.drawsVisibleOnly && this.opacity <= 0) return;
        // A node that has turned past edge-on and declines to show its back
        // paints nothing either — same reasoning, same walk skipped, and the same
        // exemption for the tracking pass, which still has to discover the assets
        // of a card that is currently face-down and will be face-up in a moment.
        if (ctx.drawsVisibleOnly && !this.backfaceVisible && facesAway(this.rotationX, this.rotationY)) return;
        this.beforeRender(ctx);
        this.onRender(ctx);
        this.afterRender(ctx);
    }

    // ---- Layout -----------------------------------------------------------

    private readonly _measuredSize: Partial<Size2D> = {};

    /**
     * Record this node's allocated bounds without touching children. Used by
     * subclasses that run their own child-layout pass (e.g. `Rect`'s flex/freeform)
     * and so skip {@link layoutChildren}.
     *
     * Compared field by field first, because `Signal.set`'s own `Object.is` guard
     * can never fire here: every caller builds a fresh object literal
     * (`layout/flow-layout.ts`, `flow-engine.ts`, `layoutFlex`, `flex-node.ts`,
     * `grid-node.ts`, `line-grid-node.ts`, `root-node.ts`), so identity always
     * differs — including on every frame of a node that is simply sitting still.
     * Without this guard every node reports a changed layout on every frame, and
     * no amount of dirty-tracking above can ever conclude otherwise.
     */
    protected setLayoutRect(rect: BoxBounds): void {
        // `peek()`, not `get()`: this is a write path, and `get()` inside whatever
        // computation happens to be running would register `_layoutRect` as one of
        // its dependencies — an edge with no business existing.
        const current = this._layoutRect.peek();
        if (
            current.x === rect.x
            && current.y === rect.y
            && current.width === rect.width
            && current.height === rect.height
        ) return;
        // Stores the *new* object rather than mutating the old one in place:
        // `layoutRect` is handed out by `get()` to `measuredRect`, to
        // `computeSpaceRects` and to bound anchor computations, and mutating it
        // under them would be an aliasing change none of them could see coming.
        this._layoutRect.set(rect);
    }

    // ---- Positioning frame ------------------------------------------------
    // A node is normally positioned by its parent. `childPositioning` /
    // `relativeToParent` let a subtree opt out of that and be placed against the
    // stage instead — see `attributes/layout/positioning.ts` for the vocabulary.
    // Everything below is the layout half of that: which children a container
    // still owns, and where the ones it doesn't actually go.

    /**
     * How this node is placed inside its parent, with `'inherit'` resolved:
     * `'relative'` (the parent lays it out) or `'absolute'` (it is pinned to the
     * stage). A root node has no parent to be absolute against, so it is always
     * `'relative'`.
     */
    get positioning(): ChildPositioning {
        const parent = this.parent2D;
        if (!parent) return "relative";
        return resolvePositioning(this.relativeToParent, parent.childPositioning);
    }

    /**
     * The children this node lays out itself — everything except the stage-pinned
     * ones. Every measure and layout pass in a container iterates *this*, not
     * `children`: an absolute child consumes no gap, takes no flex share, and
     * never contributes to a `hug` size.
     *
     * Returns the live array untouched in the common case (nothing absolute), so
     * an ordinary tree allocates nothing per pass.
     *
     * Public so the shared {@link FlowLayout} engine can read it through the
     * `FlowHost` interface, the same way {@link Rect.effectivePadding} is.
     */
    flowChildren(): Node2D[] {
        const children = this._children;
        if (this.childPositioning === "relative") {
            // Only an explicit per-child override — or a 3D child under a
            // `Canvas3D` — can leave the flow here, and both are rare enough to
            // be worth checking for before allocating.
            let i = 0;
            for (; i < children.length; i++) {
                const child = children[i];
                if (!(child instanceof Node2D) || child.relativeToParent === "absolute") break;
            }
            if (i === children.length) return children as Node2D[];
        }
        return children.filter(
            (c): c is Node2D => c instanceof Node2D && c.positioning === "relative",
        );
    }

    /**
     * Measure and place this node's stage-pinned children (see
     * {@link Node2DProps.childPositioning}).
     *
     * Each one is measured against the **stage's** content box — so `'fill'`
     * means the whole scene, not this node — and given a layout cell whose origin
     * is the stage origin expressed in this node's own child space. Its `x`/`y`
     * then read as plain scene coordinates: `x: 100` is 100px right of stage
     * centre no matter how deeply it is nested.
     *
     * The child stays *inside* this node's render scope, so ancestor `opacity`,
     * `blend`, `clip`, `effects`, rotation and scale still compose onto it — what
     * changes is where its box is anchored, not who draws it.
     *
     * Every container calls this from its own `layout`, after its flow pass —
     * including the shared {@link FlowLayout} engine through the `FlowHost`
     * interface, which is why this is public rather than protected.
     */
    layoutAbsoluteChildren(scope: Measurer): void {
        const children = this._children;
        // Hot path: the overwhelmingly common tree has nothing pinned at all.
        let any = false;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child instanceof Node2D && child.positioning === "absolute") { any = true; break; }
        }
        if (!any) return;

        const stage = this.stage();
        const stageRect = stage.layoutRect;
        const stagePad = stage.padding as InsetsResolved;
        const constraints: SizeConstraints = {
            maxWidth: Math.max(0, stageRect.width - stagePad.left - stagePad.right),
            maxHeight: Math.max(0, stageRect.height - stagePad.top - stagePad.bottom),
        };

        const origin = this.stageOriginLocal(stage);
        for (const child of children) {
            if (!(child instanceof Node2D) || child.positioning !== "absolute") continue;
            const size = child.measure(constraints, scope);
            child.layout(
                {
                    x: origin.x,
                    y: origin.y,
                    width: size.width ?? 0,
                    height: size.height ?? 0,
                },
                scope,
            );
        }
    }

    /** The top of this node's live parent chain — the scene root it hangs under. */
    private stage(): Node2D {
        let node: Node2D = this;
        for (let parent = node.parent2D; parent; parent = node.parent2D) node = parent;
        return node;
    }

    /**
     * The stage's origin, expressed in this node's child space (canvas y-down,
     * the space a `layoutRect` lives in). Handing that to a child as its layout
     * cell is what makes the child's own `x`/`y` scene coordinates.
     *
     * Computed by mapping the stage origin out to world space and back in through
     * the inverse of this node's world matrix — so it cancels every ancestor's
     * translation, and stays correct when an ancestor is rotated or scaled. Falls
     * back to this node's own origin if the chain collapses the plane (a `scale`
     * of 0 has no inverse), which is the only case with no meaningful answer.
     */
    private stageOriginLocal(stage: Node2D): Vector2 {
        if (stage === this) return { x: 0, y: 0 };
        const inverse = invert(this.worldMatrix());
        if (!inverse) return { x: 0, y: 0 };
        return applyToPoint(inverse, applyToPoint(stage.worldMatrix(), { x: 0, y: 0 }));
    }

    /**
     * Default layout: record `rect`, then freeform-layout children (see
     * {@link layoutChildren}). This is what makes a plain `Node2D` — and any
     * `ShapeNode` leaf (`Ellipse`, `Polygon`, …) that doesn't override
     * `layout` — able to nest children out of the box, the same way `Image`
     * (via `Rect`) does, just with simple centered stacking instead of
     * flex/freeform. Subclasses with their own child-layout (`Rect`,
     * `MaskGroup`, `Camera`, `BooleanGroup`) override this and call
     * {@link setLayoutRect} instead, so children aren't laid out twice — and call
     * {@link layoutAbsoluteChildren} themselves.
     */
    layout(rect: BoxBounds, scope: Measurer): void {
        this.setLayoutRect(rect);
        this.layoutChildren(rect, scope);
        this.layoutAbsoluteChildren(scope);
    }

    /**
     * Freeform-layout this node's flow children, centered within `rect`'s content
     * area: each child is measured against the padded inner box and given a
     * `BoxBounds` centered on it (sized to its own measured size, capped to the
     * content area), offsetting from center via its own `x`/`y`. Called by the
     * default {@link layout}; nodes that run their own child-layout (`Rect`'s
     * flex/freeform, `Camera`'s viewport, …) override `layout` instead and don't
     * call this.
     */
    protected layoutChildren(rect: BoxBounds, scope: Measurer): void {
        layoutFlowChildren(this.flowChildren(), rect, scope, this.padding as InsetsResolved);
    }

    /**
     * Default measure: resolve `width`/`height`, hugging children stack-style on
     * any `"hug"` axis. A `"hug"` axis shrink-wraps to the largest child extent
     * on that axis (children overlap and are centered — they don't sum), plus
     * this node's padding — the same content size {@link layoutChildren} lays
     * them out in. A fixed or `"fill"` axis resolves as before.
     *
     * This is what lets a plain {@link Node2D} — and any {@link ShapeNode} leaf
     * (`Ellipse`, `Polygon`, `Camera`, …) that doesn't override `measure` — hug
     * its children out of the box, matching how `Rect`'s `"freeform"` mode
     * measures rather than collapsing to 0 (which resolving `"hug"` against a
     * content size of `0` used to do, so a hugging non-`Rect` container rendered
     * nothing).
     *
     * Only flow children are measured: a stage-pinned child is sized against the
     * stage, so hugging it would shrink-wrap a box this node never contains.
     */
    measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
        this.constraints = constraints;
        this._lastScope = scope;

        const maxW = constraints.maxWidth ?? 0;
        const maxH = constraints.maxHeight ?? 0;
        const widthIsHug = this.width === "hug";
        const heightIsHug = this.height === "hug";

        if (!widthIsHug && !heightIsHug) {
            this._measuredSize.width = resolveSize(this.width, maxW, 0);
            this._measuredSize.height = resolveSize(this.height, maxH, 0);
            return this._measuredSize;
        }

        // Hug at least one axis: measure children (freeform-style) to a content
        // size. A non-hug axis gives children its resolved size to measure
        // against; a hug axis exposes the full available space. Padding insets
        // the area children see and is added back onto the hugged size.
        const pad = this.padding as InsetsResolved;
        const outerW = widthIsHug ? maxW : resolveSize(this.width, maxW, 0);
        const outerH = heightIsHug ? maxH : resolveSize(this.height, maxH, 0);
        const innerW = Math.max(0, outerW - pad.left - pad.right);
        const innerH = Math.max(0, outerH - pad.top - pad.bottom);

        const childConstraints: SizeConstraints = { maxWidth: innerW, maxHeight: innerH };
        let hugInnerW = 0;
        let hugInnerH = 0;
        for (const child of this.flowChildren()) {
            const size = child.measure(childConstraints, scope);
            if ((size.width ?? 0) > hugInnerW) hugInnerW = size.width ?? 0;
            if ((size.height ?? 0) > hugInnerH) hugInnerH = size.height ?? 0;
        }

        this._measuredSize.width = widthIsHug
            ? resolveSize(this.width, maxW, hugInnerW + pad.left + pad.right)
            : outerW;
        this._measuredSize.height = heightIsHug
            ? resolveSize(this.height, maxH, hugInnerH + pad.top + pad.bottom)
            : outerH;
        return this._measuredSize;
    }

    // ---- Reparenting ------------------------------------------------------

    reparent(newParent: Node2D): void;
    reparent(newParent: Node2D, duration: number, easing?: EasingFunction): Command<Record<string, never>>;
    reparent(newParent: Node2D, duration?: number, easing?: EasingFunction): void | Command<Record<string, never>> {
        if (duration === undefined) {
            const old = this.parent;
            if (old) old.removeChild(this);
            newParent.addChild(this);
            return;
        }
        return reparentAnimated(this, newParent, duration, easing);
    }

}
