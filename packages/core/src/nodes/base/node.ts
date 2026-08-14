import { Signal, SignalSnapshot } from "@/signals/signal";
import { SignalHost, TweenFn } from "@/signals/host";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { AnimationBuilder } from "@/tween/animation-builder";
import { prepareNumericCellTween } from "@/tween/prepare";
import { TweenStepper } from "@/tween/stepper";
import { RefTarget } from "@/util/reference";
import { Context, ContextMap } from "@/util/context";
import { Random } from "@/util/random";
import { AssetCatalog } from "@/assets/catalog";
import { AssetTracker } from "@/assets/tracker";
import { prepareEffect } from "@/attributes/shape/effects/registry";
import { getPropertyMeta, property, PropOptions } from "@/attributes/properties/decorator";
import { effectsProperty, insetsProperty, anchorProperty } from "@/attributes/properties/typed";
import {
    applyProp,
    applySnapshotLayer,
    collectProperties,
    popState,
    reapplyDefaults,
    restoreAnimated,
    saveState,
} from "./node-reactive";
import { advanceClock, createMotionHistory, MotionHistory, sampleMotion } from "./node-motion";
import { addChildAtAnimated, removeChildAtAnimated, reparentAnimated } from "./node-lifecycle";

import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { NodeBlendMode } from "@/attributes/shape/fill/blend";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Vector2 } from "@/attributes/layout/vector2";
import { Anchor } from "@/attributes/layout/anchor";
import { bindAnchorTarget, findAnchorKey, resolveAnchorTargetOnce, validateAnchorProps } from "@/attributes/layout/anchor-resolve";
import type { WorldTransform } from "@/attributes/layout/world-transform";
import type { PropInputs } from "@/attributes/properties/inputs";
import type { NodeClock } from "./node-clock";
import { applyToPoint, invert, Matrix2D, multiply } from "@/attributes/layout/matrix2d";
import { localMatrix, rotateOffset, worldAnchors } from "./node-transform";
import {
    applyBackdropEffects as applyBackdropEffectsImpl,
    applyContentEffectScope,
    computeSpaceRects,
} from "./node-render";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { NodeRenderState, RenderContext, SpaceRects } from "@/render/render-context";
import { Clip } from "@/render/clip";
import { TransformState } from "@/render/descriptors/transform";
import { Size2D, SizeInput, expandSize } from "@/attributes/layout/size";
import { Effect } from "@/attributes/shape/effects/chain";
import { Insets, InsetsResolved } from "@/attributes/layout/insets";
import { lerpSizeInput } from "@/layout/tweens";
import { isAutoSize, resolveSize } from "@/layout/size-resolver";
import { MeasureScope } from "@/render/measure-scope";
import { nodePath } from "@/project/tree";
import { layoutFlowChildren } from "@/layout/flow-layout";
import {
    ChildPositioning,
    RelativeToParent,
    resolvePositioning,
} from "@/attributes/layout/positioning";

/**
 * Stand-in for a node's reference rects when the context never reads them.
 * Shared and empty — `computeSpaceRects` returns the same shape for a node with
 * no parent, so consumers already handle it. See {@link Node.beforeRender}.
 */
const NO_SPACE_RECTS: SpaceRects = {};

// NodeClock, WorldTransform, PropInput, and PropInputs now live in dedicated
// modules (see imports above) and are re-exported below so existing
// `from ".../node"` imports keep resolving.
export type { NodeClock } from "./node-clock";
export type { WorldTransform } from "@/attributes/layout/world-transform";
export type { PropInput, PropInputs } from "@/attributes/properties/inputs";
export type { ChildPositioning, RelativeToParent } from "@/attributes/layout/positioning";

export interface NodeMetadata<T extends Node> {
    /**
     * Handle written with this node at construction. Typed as {@link RefTarget}
     * rather than `Reference<T>` so a ref declared as one of `T`'s *supertypes*
     * is accepted (`createRef<ShapeNode>()` on a `<Rect>`) — see the note there
     * for why that direction is the sound one.
     */
    ref?: RefTarget<T>;
}

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

export type NodeConfig<T extends Node, P> = PropInputs<P> & NodeMetadata<T>;

/**
 * The camera props a node pushes around its children — the three inputs
 * `RenderContext.beginCamera` takes beyond the viewport rect. See
 * {@link Node._cameraScope}.
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
 * Call-wide options for {@link Node.wiggle}, the trailing bag that shapes every
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

/**
 * A JSX/`children` child: a single {@link Node}, an arbitrarily-nested array of
 * children, or a falsy value. Nesting is allowed so `.map()` results can be
 * dropped straight in as a child, and falsy values are allowed so
 * `{condition && <Node/>}` works like in React — the {@link Node} constructor
 * flattens (`.flat(Infinity)`) and filters out everything but `Node` instances.
 */
export type NodeChildren = Node | false | null | undefined | NodeChildren[];

export interface NodeProps {
    x: number; // 0 is center, negative is left, positive is right
    y: number; // 0 is center, negative is down, positive is up
    width: SizeInput;
    height: SizeInput;
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
    /** When true, content drawn outside this node's outline is clipped away (see {@link Node.clipSelf}). */
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
     * Child nodes. A single {@link Node}, or an arbitrarily-nested array of them
     * — the constructor flattens nesting (`.flat(Infinity)`), so `.map()` results
     * can be dropped in directly as a child without spreading, like React.
     */
    children: NodeChildren;

    /**
     * Pivot point for rotation and scale. Either a **named anchor** (`'center'`,
     * `'topRight'`, `'bottomLeft'`, … — the node `align` vocabulary) or an explicit
     * {@link Vector2}: `(0,0)`=center, `(-1,1)`=top-left, `(1,-1)`=bottom-right. Set
     * automatically when an anchor *positioning* prop is used.
     */
    pivot: Anchor;

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

    /**
     * Origin seed for this node's {@link Node.random} source. Defaults to `0`.
     * Set it to give the node a reproducible-but-distinct random stream without
     * re-seeding by hand. The constructor adopts it as `random`'s origin, and the
     * runtime rebuilds the node each playback pass, so draws stay reproducible
     * across scrub/precomp/HMR.
     */
    seed: string | number;
}

/**
 * Base class for all scene-graph nodes.
 *
 * Every visible or structural element in a scene extends `Node`. It wires
 * together three orthogonal systems:
 *
 * **Reactive properties** — fields declared with `@property()` are backed by
 * `Signal`s. Reading them inside a reactive context (e.g. a render pass)
 * creates a subscription; writing them propagates the change automatically.
 * Use {@link set} to update one or more props imperatively, or pass a callback
 * `() => expr` to bind the prop to a derived value.
 *
 * **Tweening** — `*to(props, duration, ease?)` is a generator that animates
 * one or more props to target values over the given duration (in seconds).
 * Numeric props are interpolated; props that register a custom `tween` fn (via
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
 */
export class Node<P extends NodeProps = NodeProps> implements SignalHost {
    private _assets: AssetCatalog | null = null;
    private _parent: Node | null = null;

    get parent(): Node | null {
        return this._parent;
    }

    get assets(): AssetCatalog {
        if (!this._assets) throw new Error("AssetContext not bound — call bindAssets() before accessing assets");
        return this._assets;
    }

    /** Returns the bound asset catalog, or null if this node hasn't been bound yet. */
    protected tryAssets(): AssetCatalog | null {
        return this._assets;
    }

    // ---- Inherited context (createContext / Provider / useContext) --------
    // The token→value map pushed down from ancestor providers. Bound after the
    // tree is assembled (and re-bound from addChild for late-added subtrees),
    // mirroring `bindAssets`. Reads resolve the nearest provider's value.
    private _context: ContextMap = ContextMap.EMPTY;
    /** True once a bind walk has reached this node — gates pushing context to
     * children added afterwards (mirrors `tryAssets()` being non-null). */
    private _contextBound = false;

    /** The raw props this node was constructed with, retained past construction so
     * a provider's {@link provideContext} can see which keys the author explicitly
     * passed on every bind walk (e.g. {@link DefaultTextStyle} contributes only the
     * style keys it was given). Authored identity — deliberately kept through
     * {@link dispose} so a reused instance re-derives context from the next walk. */
    protected _props?: NodeConfig<any, P>;

    /** Read the nearest ancestor provider's value for `ctx` (or its default). */
    useContext<T>(ctx: Context<T>): T {
        return this._context.get(ctx);
    }

    /**
     * Per-node seeded randomness, available to every subclass without threading a
     * `Random` in from the stage. Defaults to seed `0`; set the origin via the
     * {@link NodeProps.seed} prop, or re-seed in the constructor with
     * `this.random.reset(seed)` / `this.random.seed = seed`.
     *
     * Draws are reproducible across scrub/precomp/HMR out of the box: the runtime
     * rebuilds a fresh node (and thus a fresh source at its constructor-set seed) on
     * every playback pass rather than reusing a source that has advanced — so a draw
     * taken during construction always starts from the seed head, no per-pass rewind
     * needed.
     */
    readonly random: Random = new Random(0);

    readonly id: string = crypto.randomUUID();

    __signals?: Map<string, Signal<any>>;
    __upgraders?: Map<string, () => Signal<any>>;
    __tweens?: Map<string, TweenFn<any>>;
    /** Maps external prop value → internal cell value for fields that need it. */
    __mappers?: Map<string, (ext: any, prev?: any) => any>;

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

    /** When true, content drawn by this node's children is clipped to its outline (see {@link clipSelf}). */
    @property({ default: false }) declare clip: boolean;

    // ---- Positioning frame ------------------------------------------------
    // Plain string cells: both are discrete modes, so `to()` snaps them at the
    // end of a tween rather than interpolating — there is nothing between
    // "laid out by my parent" and "pinned to the stage".

    /** Frame of reference this node's children are placed in. See {@link NodeProps.childPositioning}. */
    @property({ default: 'relative' }) declare childPositioning: ChildPositioning;
    /** This node's override of its parent's `childPositioning`. See {@link NodeProps.relativeToParent}. */
    @property({ default: 'inherit' }) declare relativeToParent: RelativeToParent;

    @property({ default: 1 }) declare flex: number;
    /**
     * Per-child weight for the flex gap this node contributes to its parent's
     * main axis, in `[0, 1]`. Default `1` = a full gap on each side (normal
     * layout). Driven `0 → 1` (insert) / `1 → 0` (remove) by the animated
     * `addChildAt`/`removeChildAt` overloads so the surrounding gap opens/closes
     * in lockstep with the child's box instead of popping — see
     * {@link addChildAtAnimated}. Read only by flex containers off their
     * children; authors have no reason to set it directly. `@internal`.
     */
    @property({ default: 1 }) declare gapScale: number;
    @property({ default: undefined }) declare column: number | undefined;
    @property({ default: undefined }) declare row: number | undefined;
    @property({ default: 1 }) declare colSpan: number;
    @property({ default: 1 }) declare rowSpan: number;

    private readonly _layoutRect = new Signal<BoxBounds>({ x: 0, y: 0, width: 0, height: 0 });
    protected constraints!: SizeConstraints;

    // ---- Change tracking ---------------------------------------------------
    //
    // **Nothing consumes this today.** The drawing memo that read it was removed;
    // every node now rebuilds its `Graphics` every frame. What remains is the
    // signal plumbing — `markDirty` is required by `SignalOwner` regardless — plus
    // the generation counter it feeds, kept as the substrate a future caching
    // attempt would need. Wire something to `dirtyGeneration` or delete it; do not
    // leave it in this middle state indefinitely.
    //
    // What it is *not* for, whatever reads it next: skipping the render walk. The
    // renderer is immediate-mode — `SkiaRenderContext.executePass` clears the
    // surface and redraws the world every frame — so a node that doesn't emit its
    // draw calls doesn't appear. Declining to visit a clean subtree would make
    // everything that is merely sitting still vanish. The only safe use is
    // avoiding the *rebuild*, never the walk or the draw.

    /**
     * Bumped whenever anything this node's drawing depends on goes stale.
     *
     * A monotonic counter rather than a flag, because a counter needs no
     * clearing: a cache records the generation it was built at and compares. A
     * flag would have to be reset at a pass boundary, and there are three render
     * passes per node per frame (`renderSelf`, `renderOverlay`, `renderStroke`)
     * plus a separate tracking pass during precomp — four chances to clear it in
     * the wrong place and serve a descriptor that is quietly out of date.
     */
    private _dirtyGen = 1;

    /** This node's current generation; a cache built at this value is current. Currently unread. */
    get dirtyGeneration(): number { return this._dirtyGen; }

    /**
     * The {@link MeasureScope} threaded through the last {@link measure} pass,
     * retained so off-tree work (e.g. the animated child-insert in
     * `node-lifecycle.ts`) can measure a not-yet-attached child in isolation —
     * measuring its natural size without adding it to this node's layout flow, so
     * siblings don't shift for a frame. Undefined until this node is first
     * measured. `@internal`.
     */
    _lastScope?: MeasureScope;

    /**
     * One of this node's cells went stale. Implements `SignalOwner`.
     *
     * O(1), and deliberately does not propagate: nothing above this node caches
     * anything derived from it. A parent's own `Graphics` is built from the
     * parent's own props, and children are drawn by walking to them — which
     * happens every frame regardless, because the renderer is immediate-mode.
     */
    markDirty(): void {
        this._dirtyGen++;
    }

    /**
     * Whether this node's drawing is a pure function of its own cells and its
     * children — and therefore whether the render walk may skip it when none of
     * those changed.
     *
     * **Opt-in, and it has to be.** A node can perfectly well be a function of
     * things that are not signals: `this._clock.elapsed` (a plain field advanced
     * by `advanceClock`), the velocity `sampleMotion` writes into `_renderState`
     * each frame (motion blur reads it), a `random` draw, or anything at all
     * inside a user's `renderSelf`. None of that marks a cell, so none of it can
     * be detected — a default of `true` would make every third-party node
     * silently stop updating, which is the worst failure this change could have.
     *
     * Set it on a class only after checking it reads nothing outside its own
     * props and children.
     */
    protected readonly isTimeInvariant: boolean = false;

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

    protected _children: Node[] = [];

    constructor(props?: NodeConfig<any, P>) {
        // Expand `size` sugar into width/height before anything reads either —
        // in place, so the single object retained as `_props` below already
        // carries the expanded values.
        if (props) expandSize(props as Record<string, unknown>);

        // `layoutRect` is a cell like any prop, and a node whose box moved has to
        // redraw — so it reports to the same place. Wired here rather than at the
        // field initializer because `markDirty` is an instance method.
        this._layoutRect.owner = this;

        // Retain the raw props (see _props doc) so a provider's provideContext can
        // read which keys the author passed. Captured before any default
        // application so it reflects exactly what the author passed.
        this._props = props;

        if (props?.ref) {
            props.ref(this as any);
        }

        // Adopt the configured seed as `random`'s origin (default 0). Because the
        // runtime rebuilds the node each pass, the source is fresh at this seed on
        // every pass, so draws stay reproducible without any per-pass rewind. `seed`
        // is a construction-time config, not a reactive prop, so a callback form is
        // ignored.
        if (props?.seed !== undefined && typeof props.seed !== "function") {
            this.random.reset(props.seed);
        }

        // Apply all @property()-decorated fields, reading initial values from props.
        for (const meta of getPropertyMeta(this)) {
            const propsVal = props ? (props as any)[meta.key] : undefined;
            const initial = propsVal !== undefined ? propsVal : meta.default;
            this.applyProp(meta.key, initial, meta.options);
        }

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

        if (props && (props as any).children) {
            const raw = Array.isArray((props as any).children) ? (props as any).children : [(props as any).children];
            const flat = (raw as unknown[]).flat(Infinity)
                .filter((c: unknown): c is Node => c instanceof Node);
            if (flat.length > 0) this.addChildren(flat);
        }
    }

    /**
     * Flatten a constructor's raw `children` prop into the `Node` instances it
     * contains, without mutating or adding them — the same normalisation the
     * constructor applies before {@link addChildren}, exposed standalone so
     * {@link applyDefaultSize} overrides can inspect children's own resolved
     * `width`/`height` *before* they're attached (JSX children are constructed,
     * defaults and all, before being passed in as props).
     */
    protected static flattenChildrenProp(props: { children?: unknown } | undefined): Node[] {
        const childProp = props ? props.children : undefined;
        if (!childProp) return [];
        const raw = Array.isArray(childProp) ? childProp : [childProp];
        return (raw as unknown[]).flat(Infinity).filter((c: unknown): c is Node => c instanceof Node);
    }

    /**
     * {@link flattenChildrenProp}, narrowed to the children this node will
     * actually lay out — a stage-pinned child (see
     * {@link NodeProps.childPositioning}) is neither measured against this box
     * nor placed in its flow, so it can't inform the size defaults either.
     *
     * Reads the raw `childPositioning` off `props` rather than `this`, because
     * {@link applyDefaultSize} runs from the constructor before the prop cells
     * are applied. Each child's own `relativeToParent` *is* already resolved —
     * JSX children are fully constructed before they arrive here.
     */
    protected static flowChildrenProp(
        props: ({ children?: unknown; childPositioning?: unknown }) | undefined,
    ): Node[] {
        const raw = props?.childPositioning;
        const parentDefault: ChildPositioning = raw === "absolute" ? "absolute" : "relative";
        return Node.flattenChildrenProp(props).filter(
            (c) => resolvePositioning(c.relativeToParent, parentDefault) === "relative",
        );
    }

    /**
     * True if any of `children` requests `"fill"` on `axis` — the signal a
     * container's {@link applyDefaultSize} override uses to decide whether its
     * own hug default on that axis would strand the child with no space to
     * fill into (see {@link Rect}/{@link FlexNode} overrides).
     */
    protected static hasFillChild(children: Node[], axis: "width" | "height"): boolean {
        return children.some((c) => (axis === "width" ? c.width : c.height) === "fill");
    }

    /**
     * Figma-style smart default for `width`/`height`: hug-to-content when the
     * node is given children, fill-the-parent when it's empty — so a plain
     * `new Rect({ children: [...] })` shrink-wraps like a Figma auto-layout
     * frame, while an empty one behaves like a background/spacer. Called once
     * from the constructor (skipped when `flex` is set, since that already
     * implies 'fill'), so it's the baseline every `Node` gets for free.
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
        const hasChildren = Node.flowChildrenProp(props).length > 0;
        const defaultSize = hasChildren ? "hug" : "fill";
        if (!props || props.width === undefined) this.applyProp("width", defaultSize, { tween: lerpSizeInput });
        if (!props || props.height === undefined) this.applyProp("height", defaultSize, { tween: lerpSizeInput });
    }

    // ---- Reactive properties ----------------------------------------------

    /**
     * Re-create this node's reactive signals from their @property defaults.
     *
     * This exists **only for the scene root** — the sole node instance reused
     * across playback controllers. Generator-built children are disposed and
     * rebuilt fresh on every reset, so they never need re-initialisation; the one
     * runtime caller is `Scene.reset()` on `this.root` (see {@link reinit}).
     *
     * `dispose()` is terminal — it frees every signal and sets `__signals` to
     * undefined. Scene roots, however, are owned by the project config and
     * outlive any single playback controller: under React StrictMode (and on
     * HMR) a controller is created, disposed, then a new one reuses the *same*
     * scene instances. Those reused instances would otherwise be left with
     * disposed signals, so reading e.g. `this.stroke` returns undefined and
     * `effectivePadding()` crashes on the next measure.
     *
     * Calling this restores the signals to their `@property`-default baseline.
     *
     * - Without `force` it is a no-op when signals already exist (the common,
     *   non-disposed case), so it's safe to call unconditionally before a rebuild
     *   to recover from a prior `dispose()`.
     * - With `force` it re-applies every default **even when signals are live**,
     *   restoring values without recreating the signal cells. A scene root that
     *   was tweened in one pass (e.g. precomp measuring duration) is left at its
     *   end-state; `reset()` forces a default restore so the next build's tweens
     *   snapshot the right `from` instead of the stale end value.
     *
     * Subclasses that apply constructor-specific prop defaults (e.g. {@link Rect})
     * override this to re-apply those after calling `super.reinitProps(force)`.
     */
    protected reinitProps(force = false): void {
        if (this.__signals && !force) return;
        reapplyDefaults(this);
    }

    /**
     * Public entry point to {@link reinitProps}. A {@link Scene} owns its root
     * node by composition (it no longer *is* a node), so it can't reach the
     * protected `reinitProps` directly — it calls this on its root before a
     * rebuild to restore default-baseline signals after a prior dispose, and with
     * `force` to also reset live-but-tweened props back to their defaults.
     */
    public reinit(force = false): void {
        this.reinitProps(force);
    }

    /**
     * Declare a reactive prop on this node. Creates a Signal-backed
     * accessor for `field`, applies an initial value (callback → reactive
     * binding; otherwise constant), and registers optional tween/mapper
     * metadata used by `set()` and `to()`.
     *
     * Subsequent calls for the same field reuse the existing cell and act as
     * a value assignment, so subclasses can override a parent's default by
     * calling applyProp again without losing the cell or its bindings.
     */
    protected applyProp<Ext, Int = Ext>(
        field: string,
        initial: Ext | (() => Ext) | undefined,
        options?: PropOptions<Ext, Int>,
    ): void {
        applyProp(this, field, initial, options);
    }

    /** @internal Hot-path prop write (mapper- and binding-aware). Public-but-underscored like `_toGen`/`_prepareStep` so reactive companions in this directory can call it; not part of the authoring surface. */
    _writeProp(field: string, value: unknown): void {
        if (value === undefined) return;
        const cell = this.__signals?.get(field);
        if (!cell) return;
        const mapper = this.__mappers?.get(field);
        if (typeof value === "function") {
            const extFn = value as () => any;
            cell.bind(mapper ? () => mapper(extFn(), cell.get()) : extFn);
        } else {
            cell.set(mapper ? mapper(value, cell.get()) : value);
        }
    }

    get properties(): P {
        return collectProperties(this) as P;
    }

    get name(): string {
        return this.constructor.name;
    }

    set(props: { [K in keyof P]?: P[K] | (() => P[K]) }): void {
        const signals = this.__signals;
        if (!signals) return;
        // Iterate the caller's keys (usually 1–3) rather than every registered
        // signal (15+): set() runs in the per-frame hot path. Only keys backed
        // by a signal are written; unknown keys are ignored as before.
        // `size` has no signal of its own — it's sugar written straight to
        // width/height (explicit width/height in the same call still wins).
        const sizeVal = (props as any).size;
        for (const key in props) {
            const val = (props as any)[key];
            if (val !== undefined && signals.has(key)) this._writeProp(key, val);
        }
        if (sizeVal !== undefined) {
            if ((props as any).width === undefined) this._writeProp('width', sizeVal);
            if ((props as any).height === undefined) this._writeProp('height', sizeVal);
        }
    }

    to(to: Partial<P>, duration: number, easing?: EasingFunction): AnimationBuilder<P> {
        return new AnimationBuilder<P>(this, { to, duration, easing });
    }

    /**
     * Resolve a single `to()` step into a flat {@link TweenStepper} — all the
     * per-key setup (anchor handling, mapper, numeric-vs-custom routing) happens
     * once here, then `advance(dt)` is allocation-free. Used by both the
     * generator path (`_toGen`) and the batched `parallel` path.
     */
    _prepareStep(to: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper {
        // `size` has no signal of its own — expand it into width/height targets
        // before anchor validation and the per-key tween setup below see it.
        expandSize(to as Record<string, unknown>);

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

        // Numeric, mapper-free props (x/y/scale/rotation/opacity) write straight
        // to their cell — no property-setter / mapper indirection per step.
        const numCells: Signal<number>[] = [];
        const numFrom: number[] = [];
        const numEnd: number[] = [];
        const customLerps: Array<(t: number) => void> = [];
        const stringSnaps: Array<[string, string]> = [];

        for (const key of Object.keys(to)) {
            const cell = this.__signals?.get(key);
            if (!cell) continue;
            const extVal = (to as any)[key];
            // Map external → internal so the tween operates in stored space.
            const mapper = this.__mappers?.get(key);
            const targetVal = mapper ? mapper(extVal, (this as any)[key]) : extVal;
            const tweenFn = this.__tweens?.get(key);
            if (tweenFn) {
                const from = (this as any)[key];
                customLerps.push((t) => {
                    cell.set(tweenFn(from, targetVal, t));
                });
            } else if (typeof targetVal === 'number') {
                if (mapper) {
                    // Numeric but mapped: keep the setter path so the mapper runs.
                    const from = (this as any)[key] as number;
                    customLerps.push((t) => { (this as any)[key] = from + (targetVal - from) * t; });
                } else {
                    numCells.push(cell as Signal<number>);
                    numFrom.push((this as any)[key] as number);
                    numEnd.push(targetVal as number);
                }
            } else if (typeof targetVal === 'string') {
                stringSnaps.push([key, targetVal]);
            }
        }

        const lerp = prepareNumericCellTween(numCells, numFrom, numEnd);
        const hasCustom = customLerps.length > 0;
        const hasSnaps = stringSnaps.length > 0;

        const apply = (t: number): void => {
            const easedT = easing ? easing(t) : t;
            lerp(easedT);
            if (hasCustom) for (const fn of customLerps) fn(easedT);
        };

        let elapsed = 0;
        return {
            seek: (e: number) => apply(duration > 0 ? Math.min(e / duration, 1) : 1),
            advance: (dt: number): boolean => {
                elapsed += dt;
                if (elapsed < duration) {
                    apply(elapsed / duration);
                    return false;
                }
                apply(1);
                if (hasSnaps) for (const [key, val] of stringSnaps) (this as any)[key] = val;
                return true;
            },
        };
    }

    *_toGen(to: Partial<P>, duration: number, easing?: EasingFunction): FrameGenerator {
        const step = this._prepareStep(to, duration, easing);
        step.seek(0);
        let done = false;
        while (!done) {
            const dt = yield;
            done = step.advance(dt);
        }
    }

    // ---- Motion helpers ---------------------------------------------------

    /**
     * Animate both `x` and `y` to the given position.
     *
     * @example
     * yield* node.moveTo(200, 100, 0.5, ease.outCubic);
     */
    *moveTo(x: number, y: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ x, y } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the horizontal position (`x`).
     *
     * @example
     * yield* node.moveX(300, 0.4);
     */
    *moveX(x: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ x } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the vertical position (`y`).
     *
     * @example
     * yield* node.moveY(-50, 0.4);
     */
    *moveY(y: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ y } as Partial<P>, duration, ease);
    }

    /**
     * Animate `opacity` to the target value.
     *
     * @param opacity Target opacity in the range `[0, 1]`.
     * @example
     * yield* node.fadeTo(0, 0.3);   // fade out
     * yield* node.fadeTo(1, 0.3);   // fade in
     */
    *fadeTo(opacity: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ opacity } as Partial<P>, duration, ease);
    }

    /**
     * Animate `rotate` to the target angle (degrees, clockwise).
     *
     * @example
     * yield* node.rotateTo(180, 0.6, ease.inOutQuad);
     */
    *rotateTo(rotation: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ rotation } as Partial<P>, duration, ease);
    }

    /**
     * Animate `scale` to the target factor.
     *
     * @example
     * yield* node.scaleTo(1.5, 0.4);   // grow
     * yield* node.scaleTo(0,   0.3);   // shrink to nothing
     */
    *scaleTo(scale: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ scale } as Partial<P>, duration, ease);
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
     * distinct seeds (via the {@link NodeProps.seed} prop) so a crowd wiggles out
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
    *wiggle(
        amplitudes: { [K in keyof P]?: number },
        duration: number,
        options?: WiggleOptions,
    ): FrameGenerator {
        const frequency = options?.frequency ?? 4;
        // The ease-out window: `settle` overrides, else a short fraction of the
        // run, capped so a very short wiggle still spends most of its time
        // actually wiggling, and zero for an unbounded (Infinity) wiggle — there's
        // no end to ease toward.
        const settle = options?.settle ?? (Number.isFinite(duration) && duration > 0
            ? Math.min(0.25, 0.15 / duration)
            : 0);

        // Resolve each key to its numeric cell + captured base once, up front.
        // `base` is captured now so the jitter rides on top of wherever the prop
        // is at the start — what lets wiggle compose with a concurrent to() on a
        // different prop.
        //
        // The offset is applied in the prop's *stored* space via `cell.set` — a
        // mapped numeric prop (a clamp / scale mapper) stores a number, so the
        // wiggle rides on the resolved value directly; that also sidesteps the
        // double-mapping a setter write would cause (the mapper is one-way, so
        // there's no author-space base to recover). A prop whose stored value
        // isn't a plain number — `width: 'fill'`, or a per-corner `cornerRadius`
        // object — has no scalar to offset, so it's skipped with a dev warning.
        interface WiggleTarget { cell: Signal<number>; base: number; amplitude: number; phase: number; }
        const resolved: WiggleTarget[] = [];
        for (const key in amplitudes) {
            const amplitude = amplitudes[key];
            if (amplitude === undefined) continue;

            const cell = this.__signals?.get(key) as Signal<number> | undefined;
            const base = cell?.get();
            if (!cell || typeof base !== 'number') {
                if (cell) {
                    console.warn(`Node.wiggle: prop "${key}" isn't a plain number (got ${typeof base}); skipping. wiggle only offsets numeric props.`);
                }
                continue;
            }

            resolved.push({
                cell,
                base,
                amplitude,
                // Give each prop its own region of the noise field so props
                // wiggled together (x + y) draw independent curves instead of
                // moving in lockstep. A per-key hash — not `key.length`, which
                // collides for same-length names like x/y — spreads the sample
                // points far apart, past any overlap for a realistic run.
                phase: wigglePhase(key),
            });
        }
        if (resolved.length === 0) return;

        let elapsed = 0;
        while (elapsed < duration) {
            const t = duration > 0 && Number.isFinite(duration) ? elapsed / duration : 0;
            // Ease every offset to zero over the final `settle` window.
            const fade = settle > 0 && t > 1 - settle ? (1 - t) / settle : 1;
            for (const target of resolved) {
                // noise() returns [0, 1]; remap to [-1, 1] for a symmetric swing
                // around the base.
                const swing = this.random.noise(target.phase + elapsed, frequency) * 2 - 1;
                target.cell.set(target.base + swing * target.amplitude * fade);
            }
            elapsed += yield;
        }
        // Land exactly on the bases — no residual offset from the last frame.
        for (const target of resolved) target.cell.set(target.base);
    }

    // ---- State stack (save / restore) -------------------------------------
    // A per-node LIFO stack of property snapshots, mirroring Motion Canvas's
    // node.save()/restore(). `save()` pushes a snapshot of every reactive prop;
    // `restore()` pops the most recent one and either snaps to it (no duration)
    // or tweens the numeric props back to it over `duration`.

    /** @internal LIFO stack of save() snapshot layers. Underscore-internal so the reactive companion can read it; not authoring surface. */
    _stateStack: Map<string, SignalSnapshot<any>>[] = [];

    /**
     * Push a snapshot of this node's current state onto its save stack.
     *
     * Every reactive prop (`x`, `y`, `scale`, `opacity`, `fill`, …) is captured,
     * preserving reactive bindings — a prop bound to `() => other().x` is saved
     * as the binding, not just its resolved value, so {@link restore} re-binds
     * it rather than freezing the value. Calls stack: each `save()` pushes a new
     * layer, and each {@link restore} pops the most recent one.
     *
     * @example
     * node.save();
     * yield* node.moveTo(200, 0, 1);
     * yield* node.restore(1);   // animate back to where it was saved
     */
    save(): void {
        saveState(this);
    }

    /**
     * Pop the most recent {@link save} snapshot and roll this node back to it.
     *
     * Called with no `duration` (or `0`), every prop is reapplied instantly —
     * plain values are set, reactive bindings are re-bound. Called with a
     * positive `duration`, the numeric props (and any with a custom `tween`)
     * animate toward their saved values over that many seconds; once the tween
     * finishes the full snapshot is reapplied, which re-binds any reactive props
     * and snaps non-tweenable props (e.g. strings) to their saved values.
     *
     * A no-op (returns immediately) if there is nothing on the stack.
     *
     * @param duration Seconds to animate the rollback over. Omit for an instant restore.
     * @param easing   Optional easing for the animated restore.
     */
    restore(): void;
    restore(duration: number, easing?: EasingFunction): FrameGenerator;
    restore(duration?: number, easing?: EasingFunction): void | FrameGenerator {
        const layer = popState(this);
        if (duration === undefined || duration <= 0) {
            if (layer) applySnapshotLayer(this, layer);
            return;
        }
        return restoreAnimated(this, layer, duration, easing);
    }

    // ---- Clock ------------------------------------------------------------

    private _clock: NodeClock = {
        time: 0,
        creation: 0,
        elapsed: 0,
        initialized: false,
    };

    public tick(_globalTime: number): void {

    }

    /** Internal timing state. */
    public get clock(): Readonly<NodeClock> {
        return this._clock;
    }

    public ellapse(totalTime: number): void {
        advanceClock(this._clock, totalTime);

        this.tick(this._clock.time);
        // Sample motion here, not at render: ellapse() runs on every advanced
        // frame in every playback path (forward, scrub, precomp), whereas
        // render() runs only for displayed frames. Sampling per-frame is what
        // makes velocity correct on the first frame after a scrub/rewind, where
        // sampling only at render time read zero velocity. The advance loop runs
        // ellapse() before generator.next() (so audio scheduling in generator
        // bodies reads the right clock time), which means x/y here still hold the
        // previous frame's value — velocity therefore trails the rendered
        // position by one frame. That lag is constant and identical forward vs.
        // scrub, and imperceptible for motion blur.
        this._sample();

        for (const child of this._children) child.ellapse(totalTime);
    }

    /**
     * Per-frame sampling of derived render state (currently motion). Recurses to
     * children so the whole subtree is sampled in one pass. Called from
     * {@link ellapse} every frame; kept as a named seam so the priming path can
     * seed the same state without a full ellapse (see StateEvaluator.resetSlot).
     */
    public sample(): void {
        this._sample();
        for (const child of this._children) child.sample();
    }

    /** Sample this node's own derived render state for the current frame. */
    private _sample(): void {
        this._sampleMotion();
    }

    // ---- Asset lifecycle --------------------------------------------------

    bindAssets(context: AssetCatalog): void {
        // Already bound to this catalog, and so is everything below: the only ways
        // a subtree joins the tree — `addChild`/`addChildren`/`addChildAt` — bind it
        // on insertion. So an unchanged catalog means the whole subtree is already
        // correct, and the per-frame re-bind the precomp and replay loops perform
        // can stop here instead of walking every node.
        if (this._assets === context) return;
        this._assets = context;
        for (const child of this._children) child.bindAssets(context);
    }

    // ---- Context lifecycle ------------------------------------------------

    /**
     * Hook for applying **inherited context values** to this node, once, after the
     * node is linked into the tree and the context walk has resolved its ancestors'
     * providers — the first moment {@link useContext} returns real values (the
     * constructor runs before the node is linked, so it can't read context).
     *
     * Runs **exactly once per node instance**: the runtime rebuilds the subtree on
     * every reset/scrub/precomp rather than replaying this hook, so there is no
     * "each pass" re-entry to guard against — never call {@link clearChildren} or
     * write idempotency ceremony here.
     *
     * ### Composition rule
     * **Structure** (which children exist, and how many) is built in the
     * **constructor** via {@link add} from *props* — never here, and never from
     * context. This hook applies context-derived **values** only: read the resolved
     * value from `ctx` (or {@link useContext}) and write it onto the already-built
     * structure, typically through refs captured in the constructor.
     *
     * @example
     * // constructor: this.add(<Rect ref={this.accent} … />)   // structure from props
     * protected override resolveContext(ctx: ContextMap): void {
     *   this.accent().set({ fill: ctx.get(ThemeToken).accent }); // value from context
     * }
     *
     * @param ctx The resolved {@link ContextMap} for this node — the same map its
     *            children inherit. `ctx.get(token)` is equivalent to
     *            {@link useContext}, passed in so the single-fire timing is explicit.
     */
    protected resolveContext(_ctx: ContextMap): void { }

    /**
     * Providers override this to attach their token(s) to the {@link ContextMap}
     * handed to descendants. Base passes the parent's map through unchanged.
     */
    protected provideContext(parent: ContextMap): ContextMap {
        return parent;
    }

    /**
     * Push inherited context down this subtree, mirroring {@link bindAssets}.
     *
     * `runResolve` separates the two responsibilities the walk has:
     * - `true` (first bind of this instance / a freshly-added child): also invoke
     *   {@link resolveContext}, which applies inherited context *values* to the
     *   already-built structure. It runs once per instance (the runtime rebuilds
     *   rather than replaying), so it must not depend on being re-fired.
     * - `false` (per-frame structural re-push): only refresh `_context` so subtrees
     *   added this frame inherit it — must **not** re-fire {@link resolveContext},
     *   which would clobber an in-flight tween's value every frame.
     */
    bindContext(parent: ContextMap, runResolve: boolean): void {
        const next = this.provideContext(parent);
        // Unchanged map, already bound, and not the once-per-instance resolve
        // pass ⇒ this whole subtree already holds `next` and the walk is pure
        // repetition. The same short-circuit `bindAssets` has, for the same
        // reason, on the sibling walk.
        //
        // Sound because the *only* thing the per-frame pass exists to catch —
        // a subtree added since the last one — is already handled at insertion:
        // `addChild`, `addChildren` and `addChildAt` each call
        // `bindChildContext`, which binds the newcomer immediately (and
        // `node-lifecycle`'s animated inserts go through those same three).
        //
        // Gated on `!runResolve` deliberately. `runResolve` is the first bind of
        // an instance, where `resolveContext` has to fire exactly once; leaving
        // that path untouched keeps this change to the repeated pass and away
        // from the once-only semantics.
        if (!runResolve && this._contextBound && this._context === next) return;
        this._context = next;
        this._contextBound = true;
        if (runResolve) this.resolveContext(next);
        for (const child of this._children) child.bindContext(next, runResolve);
    }

    /** Push this node's current context onto a newly-added child (and run its
     * {@link resolveContext}), but only if this node has itself been bound — so
     * children added before the first bind walk are left for that walk to reach. */
    private bindChildContext(child: Node): void {
        if (this._contextBound) child.bindContext(this._context, true);
    }

    /**
     * Adopt a **detached** node for binding only — its asset catalog, inherited
     * context and clock — without making it a child.
     *
     * Tree membership supplies three things a node cannot work without: the asset
     * catalog (a webfont never shapes and an `<Image>` never loads without it),
     * the resolved context map (theme tokens), and a ticking clock. Layout and
     * painting are *not* among them. So a node used purely as a source of pixels —
     * a `Tex.surface(...)` subtree rasterized onto 3D geometry — can be bound by
     * whatever consumes it and laid out on demand, instead of having to sit in a
     * particular place in the tree.
     *
     * Safe to call every frame: `bindAssets` short-circuits on an unchanged
     * catalog, `resolveContext` is fired only on the adoptee's first bind, and
     * `ellapse` is idempotent for a repeated time.
     */
    protected adoptDetached(node: Node): void {
        const assets = this.tryAssets();
        if (assets) node.bindAssets(assets);
        if (this._contextBound) node.bindContext(this._context, !node._contextBound);
        node.ellapse(this.clock.time);
    }

    /**
     * Declare every asset **layout** depends on — fonts, and any opaque async
     * load that measurement needs (e.g. {@link Code}'s syntax grammar).
     *
     * Runs ahead of {@link layout}, so the node cannot read its `layoutRect`
     * here: anything that needs a size belongs in {@link prepareRender}. That
     * ordering is the only reason there are two hooks.
     *
     * **Synchronous, and a declaration rather than the work itself.** Async
     * loading goes through `tracker.addAsync(key, load)`, which puts it on the
     * frame-ranged timeline so the {@link AssetManager} runs it when its window
     * opens and the render path can *wait* for it. A hook that did the awaiting
     * itself could only ever be fire-and-forget, which is what left `Code`
     * laying out against untokenized text.
     *
     * Nothing is inferred from a render pass. A node that draws an asset it did
     * not declare does not degrade — it throws when the renderer reaches for it.
     *
     * ```ts
     * override prepareLayout(tracker: AssetTracker): void {
     *     tracker.addFont("Roboto");
     *     tracker.addAsync("grammar:java", () => loadGrammar("java"));
     * }
     * ```
     */
    prepareLayout(_tracker: AssetTracker): void {

    }

    /**
     * Declare every asset **render** needs — images, video, 3D resources, effect
     * textures, and the audio a playing clip schedules.
     *
     * Runs after {@link layout}, so `layoutRect` is live and a declaration can be
     * sized to what will actually be painted (which is how the decode resolution
     * is chosen). See {@link prepareLayout} for the rest of the contract.
     *
     * The base implementation declares this node's `effects`; {@link ShapeNode}
     * extends it with `fill`/`overlay`/`stroke`/`shadow`, so most nodes never
     * override this at all — only one that paints something its attributes don't
     * describe (a raw `Graphics` built from a literal src) has anything to add.
     *
     * ```ts
     * override prepareRender(tracker: AssetTracker): void {
     *     super.prepareRender(tracker);
     *     tracker.addImage("./images/1.png", { width: 100, height: 100 });
     * }
     * ```
     */
    prepareRender(tracker: AssetTracker): void {
        const effects = this.effects as SceneEffect[];
        if (effects.length === 0) return;
        const rect = this.layoutRect;
        for (const effect of effects) {
            prepareEffect(effect, tracker, rect?.width ?? 0, rect?.height ?? 0);
        }
    }

    /**
     * Walk the subtree collecting each node's **pre-layout** declarations (see
     * {@link prepareLayout}).
     */
    prepareLayoutAssets(tracker: AssetTracker): void {
        this.prepareLayout(tracker);
        const children = this._children;
        for (let i = 0; i < children.length; i++) {
            children[i].prepareLayoutAssets(tracker);
        }
    }

    /**
     * Walk the subtree collecting each node's **pre-render** declarations (see
     * {@link prepareRender}).
     *
     * Stamps the owning node's structural path while each node declares, so an
     * audio request lands on its own timeline bar — purely for display, playback
     * ignores `ownerPath`. That stamping used to live on a third `prepareAudio`
     * walk; audio needs no layout, so a `Video` declaring its picture and its
     * sound in one place is both simpler and one fewer tree walk per frame.
     */
    prepareRenderAssets(tracker: AssetTracker, path: string = ""): void {
        tracker.withOwnerPath(path, () => this.prepareRender(tracker));
        const children = this._children;
        for (let i = 0; i < children.length; i++) {
            children[i].prepareRenderAssets(tracker, nodePath(path, i));
        }
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
     * This node's local transform in canvas (y-down) space, matching the matrix
     * the renderer pushes in {@link applyTransform}/`RenderContext.transform`.
     * Composed with the parent chain by {@link worldMatrix}.
     */
    /** @internal Composed with the camera scopes in between by `runtime/node-picking.ts`. */
    _localMatrix(): Matrix2D {
        const r = this.layoutRect;
        const cx = (r?.x ?? 0) + this.x;
        const cy = (r?.y ?? 0) - this.y;
        // The accessor stores the resolved normalised pivot via the mapper.
        return localMatrix(cx, cy, this.rotation, this.scale, this.pivot as Vector2, r?.width ?? 0, r?.height ?? 0);
    }

    /**
     * This node's full transform in canvas (y-down) world space — the product of
     * every ancestor's local matrix from the root down to this node. Reactive:
     * walks the live parent chain and reads each node's transform signals.
     */
    protected worldMatrix(): Matrix2D {
        const local = this._localMatrix();
        const parent = this._parent;
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
        for (let n: Node | null = this; n; n = n._parent) {
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

    // ---- Child management -------------------------------------------------

    get children(): Node[] {
        return this._children;
    }

    /**
     * Compose this node's internal children — the constructor-friendly entry point
     * a custom composite calls to build its own subtree (a single node or an array,
     * JSX included). Sugar over {@link addChild}/{@link addChildren}: it works the
     * same before the node is linked into the tree (in the constructor) as after,
     * so a composite builds its structure from *props* right in its constructor —
     * no `init`-style hook, no idempotency guard, since the constructor runs once.
     *
     * Accepts the same shape as the `children` prop — a single node, or an
     * arbitrarily-nested array (`.flat(Infinity)`), with non-`Node` entries
     * (`false`/`null`/`undefined` from `cond && <Node/>`) filtered out — so
     * `this.add(items.map(...))` or `this.add(cond && <Text/>)` work directly.
     *
     * @example
     * constructor(props?) {
     *   super(props);
     *   this.add(<Rect ref={this.rowRef} flow="horizontal">{…}</Rect>);
     * }
     */
    add(child: NodeChildren): void {
        if (child instanceof Node) {
            this.addChild(child);
            return;
        }
        const raw: unknown[] = Array.isArray(child) ? child : [child];
        const flat = raw.flat(Infinity).filter((c: unknown): c is Node => c instanceof Node);
        if (flat.length > 0) this.addChildren(flat);
    }

    addChild(child: Node): void {
        this._children.push(child);
        child._parent = this;
        const assets = this.tryAssets();
        if (assets) child.bindAssets(assets);
        this.bindChildContext(child);
    }

    removeChild(child: Node): Node | null {
        const i = this._children.indexOf(child);
        if (i < 0) return null;
        const [removed] = this._children.splice(i, 1);
        if (removed) removed._parent = null;
        return removed ?? null;
    }

    addChildren(children: Node[]): void {
        this._children.push(...children);
        for (const child of children) child._parent = this;
        const assets = this.tryAssets();
        if (assets) for (const child of children) child.bindAssets(assets);
        for (const child of children) this.bindChildContext(child);
    }

    clearChildren(): void {
        for (const child of this._children) child._parent = null;
        this._children.length = 0;
    }

    addChildAt(child: Node, index: number): void;
    addChildAt(child: Node, index: number, duration: number, easing?: EasingFunction): FrameGenerator;
    addChildAt(child: Node, index: number, duration?: number, easing?: EasingFunction): void | FrameGenerator {
        if (duration === undefined) {
            this._children.splice(index, 0, child);
            child._parent = this;
            const assets = this.tryAssets();
            if (assets) child.bindAssets(assets);
            this.bindChildContext(child);
            return;
        }
        return this._addChildAtAnimated(child, index, duration, easing);
    }

    removeChildAt(index: number): Node | null;
    removeChildAt(index: number, duration: number, easing?: EasingFunction): FrameGenerator;
    removeChildAt(index: number, duration?: number, easing?: EasingFunction): (Node | null) | FrameGenerator {
        if (duration === undefined) {
            if (index < 0 || index >= this._children.length) return null;
            const [removed] = this._children.splice(index, 1);
            if (removed) removed._parent = null;
            return removed ?? null;
        }
        return this._removeChildAtAnimated(index, duration, easing);
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

    /** Push this node's transform (position, scale, rotate, opacity, effects). */
    protected applyTransform(ctx: RenderContext): void {
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
        s.pivot = this.pivot as Vector2;
        ctx.transform(s);
    }

    /**
     * Hook for custom nodes that draw their own content (raw `Graphics`
     * commands, etc.) without subclassing {@link ShapeNode}. Called from
     * `onRender` between the transform push and the children render, the same
     * slot `ShapeNode.renderSelf` occupies. No-op by default — drawing nothing
     * here doesn't change the render flow at all.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` (not `_ctx`) so overriders see the real param name
    protected renderSelf(ctx: RenderContext): void { }

    /**
     * Paint the node's `overlay` layer — over its own fill *and* its children,
     * but under the stroke — clipped to the node's silhouette. Called from
     * `onRender` after children render and before {@link renderStroke}. No-op by
     * default; {@link ShapeNode} paints the resolved overlay as a fill of its
     * silhouette so a texture (e.g. VHS grain) sits over the whole subtree.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` so overriders see the real param name
    protected renderOverlay(ctx: RenderContext): void { }

    /**
     * Paint the node's stroke last — over its fill, children, and overlay.
     * Deferred out of {@link renderSelf} (which now draws only shadow+fill) so
     * the stroke frames the whole subtree and sits above any overlay. Called
     * from `onRender` after {@link renderOverlay}. No-op by default; {@link
     * ShapeNode} strokes its silhouette.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept as `ctx` so overriders see the real param name
    protected renderStroke(ctx: RenderContext): void { }

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
    protected applyClip(ctx: RenderContext): boolean {
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
    private applyBackdropEffects(ctx: RenderContext): void {
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
    protected renderContentWithEffects(ctx: RenderContext, body: () => void): void {
        this.applyBackdropEffects(ctx);
        applyContentEffectScope(ctx, this.effects as SceneEffect[], this.clipPathSelf(), this.layoutRect?.width ?? 0, this.layoutRect?.height ?? 0, body);
    }

    onRender(ctx: RenderContext): void {
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

    renderChildren(ctx: RenderContext): void {
        for (const child of this._children) child.render(ctx);
    }

    beforeRender(ctx: RenderContext): void {
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
        return computeSpaceRects(this._parent?.layoutRect, this.layoutRect, this.x, this.y);
    }

    afterRender(ctx: RenderContext): void {
        ctx.end();
    }

    render(ctx: RenderContext): void {
        // A subtree at zero opacity paints nothing, so on a context that only
        // draws what can be seen there is no reason to walk it. Not a niche case:
        // a chart carries a full second axis at `opacity: 0` purely to reserve a
        // gutter, and every cross-fade spends its first and last frames here.
        //
        // `drawsVisibleOnly` is false on the tracking walk, which must still
        // descend — an invisible node's font and images have to be discovered or
        // they will not have loaded by the time it fades in. See the flag's doc.
        if (ctx.drawsVisibleOnly && this.opacity <= 0) return;
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
        if (!this._parent) return "relative";
        return resolvePositioning(this.relativeToParent, this._parent.childPositioning);
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
    flowChildren(): Node[] {
        const children = this._children;
        if (this.childPositioning === "relative") {
            // Only an explicit per-child override can leave the flow here, and
            // that is rare enough to be worth checking for before allocating.
            let i = 0;
            for (; i < children.length; i++) {
                if (children[i].relativeToParent === "absolute") break;
            }
            if (i === children.length) return children;
        }
        return children.filter((c) => c.positioning === "relative");
    }

    /**
     * Measure and place this node's stage-pinned children (see
     * {@link NodeProps.childPositioning}).
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
    layoutAbsoluteChildren(scope: MeasureScope): void {
        const children = this._children;
        // Hot path: the overwhelmingly common tree has nothing pinned at all.
        let any = false;
        for (let i = 0; i < children.length; i++) {
            if (children[i].positioning === "absolute") { any = true; break; }
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
            if (child.positioning !== "absolute") continue;
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
    private stage(): Node {
        let node: Node = this;
        while (node._parent) node = node._parent;
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
    private stageOriginLocal(stage: Node): Vector2 {
        if (stage === this) return { x: 0, y: 0 };
        const inverse = invert(this.worldMatrix());
        if (!inverse) return { x: 0, y: 0 };
        return applyToPoint(inverse, applyToPoint(stage.worldMatrix(), { x: 0, y: 0 }));
    }

    /**
     * Default layout: record `rect`, then freeform-layout children (see
     * {@link layoutChildren}). This is what makes a plain `Node` — and any
     * `ShapeNode` leaf (`Ellipse`, `Polygon`, …) that doesn't override
     * `layout` — able to nest children out of the box, the same way `Image`
     * (via `Rect`) does, just with simple centered stacking instead of
     * flex/freeform. Subclasses with their own child-layout (`Rect`,
     * `MaskGroup`, `Camera`, `BooleanGroup`) override this and call
     * {@link setLayoutRect} instead, so children aren't laid out twice — and call
     * {@link layoutAbsoluteChildren} themselves.
     */
    layout(rect: BoxBounds, scope: MeasureScope): void {
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
    protected layoutChildren(rect: BoxBounds, scope: MeasureScope): void {
        layoutFlowChildren(this.flowChildren(), rect, scope, this.padding as InsetsResolved);
    }

    /**
     * Default measure: resolve `width`/`height`, hugging children stack-style on
     * any `"hug"` axis. A `"hug"` axis shrink-wraps to the largest child extent
     * on that axis (children overlap and are centered — they don't sum), plus
     * this node's padding — the same content size {@link layoutChildren} lays
     * them out in. A fixed or `"fill"` axis resolves as before.
     *
     * This is what lets a plain {@link Node} — and any {@link ShapeNode} leaf
     * (`Ellipse`, `Polygon`, `Camera`, …) that doesn't override `measure` — hug
     * its children out of the box, matching how `Rect`'s `"freeform"` mode
     * measures rather than collapsing to 0 (which resolving `"hug"` against a
     * content size of `0` used to do, so a hugging non-`Rect` container rendered
     * nothing).
     *
     * Only flow children are measured: a stage-pinned child is sized against the
     * stage, so hugging it would shrink-wrap a box this node never contains.
     */
    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
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

    reparent(newParent: Node): void;
    reparent(newParent: Node, duration: number, easing?: EasingFunction): FrameGenerator;
    reparent(newParent: Node, duration?: number, easing?: EasingFunction): void | FrameGenerator {
        if (duration === undefined) {
            const old = this.parent;
            if (old) old.removeChild(this);
            newParent.addChild(this);
            return;
        }
        return this._reparentAnimated(newParent, duration, easing);
    }

    private *_reparentAnimated(newParent: Node, duration: number, easing?: EasingFunction): FrameGenerator {
        yield* reparentAnimated(this, newParent, duration, easing);
    }

    private *_addChildAtAnimated(child: Node, index: number, duration: number, easing?: EasingFunction): FrameGenerator {
        yield* addChildAtAnimated(this, child, index, duration, easing);
    }

    private *_removeChildAtAnimated(index: number, duration: number, easing?: EasingFunction): FrameGenerator {
        yield* removeChildAtAnimated(this, index, duration, easing);
    }

    // ---- Teardown ---------------------------------------------------------

    dispose(): void {
        // No per-node loader disposers to run: an async load is declared through
        // `tracker.addAsync`, so its `Disposer` belongs to the `LoaderRecord` on
        // the timeline and `AssetManager` runs it when the frame window closes.
        if (this.__signals) {
            for (const cell of this.__signals.values()) {
                cell.dispose();
            }
        }
        this.__signals = undefined;
        this.__upgraders = undefined;
        this.__tweens = undefined;
        this.__mappers = undefined;
        this._assets = null;
        // Drop inherited context so a reused instance re-derives it from the next
        // bind walk rather than serving a stale map. `_props` is authored identity
        // and is deliberately retained so provideContext still works after reuse.
        this._context = ContextMap.EMPTY;
        this._contextBound = false;
    }
}
