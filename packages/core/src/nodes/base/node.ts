import { Signal, SignalSnapshot } from "@/signals/signal";
import { SignalHost, TweenFn } from "@/signals/host";
import { EaseFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { AnimationBuilder } from "@/tween/animation-builder";
import { prepareNumericCellTween } from "@/tween/prepare";
import { TweenStepper } from "@/tween/stepper";
import { Reference } from "@/util/reference";
import { AssetCatalog } from "@/assets/catalog";
import { AssetTracker } from "@/assets/tracker";
import { getPropertyMeta, property, PropOptions } from "@/attributes/properties/decorator";

import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { NodeBlendMode } from "@/attributes/shape/fill/blend";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Vector2, lerpVector2 } from "@/attributes/layout/vector2";
import { Matrix2D, applyToPoint, multiply, nodeLocalMatrix } from "@/attributes/layout/matrix2d";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { NodeRenderState, RenderContext, SpaceRects } from "@/render/render-context";
import { Clip } from "@/render/clip";
import { TransformState } from "@/render/descriptors/transform";
import { Size2D, SizeInput } from "@/attributes/layout/size";
import { Effect, resolveChainEffects } from "@/attributes/shape/effects/chain";
import { Padding, resolvePadding } from "@/attributes/layout/padding";
import { lerpEdgeInset, lerpSizeInput } from "@/layout/tweens";
import { lerpEffectArray } from "@/attributes/shape/effects/registry";
import { isAutoSize, resolveSize } from "@/layout/size-resolver";
import { MeasureScope } from "@/render/measure-scope";
import { nodePath } from "@/project/tree";
import { layoutGroupChildren } from "@/layout/group-layout";

export interface NodeClock {
    time: number;       // Absolute time since the scene started
    creation: number;   // The absolute time when this specific node was born
    elapsed: number;    // How long this node has existed (time - creation)
    initialized: boolean; // Whether the node has been initialized
}

export interface NodeMetadata<T extends Node> {
    ref?: Reference<T>;
}

export type PropInput<T> = T | (() => T);

export type PropInputs<P> = {
    [K in keyof P]?: P[K] | (() => P[K]);
};

export type NodeConfig<T extends Node, P> = PropInputs<P> & NodeMetadata<T>;

/** Keys for anchor-based positioning props. */
export type AnchorKey =
    | 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
    | 'topCenter' | 'bottomCenter' | 'leftCenter' | 'rightCenter';

/**
 * A node's resolved transform in global (world / scene-root) space. Unlike the
 * per-node `x`/`y` and anchor getters — which are relative to the node's parent
 * — every field here is folded through the full ancestor chain, so two nodes
 * under different parents can be compared or aligned directly.
 *
 * Positions use the same y-up convention as `x`/`y` (positive y is up). Read
 * inside a reactive callback (`x: () => other().global.topRight.x`) they track
 * changes to this node's *and* every ancestor's layout/transform.
 */
export interface WorldTransform {
    /** World position of the node's center (its `x`/`y` origin). */
    readonly x: number;
    readonly y: number;
    readonly center: Vector2;
    readonly topLeft: Vector2;
    readonly topRight: Vector2;
    readonly bottomLeft: Vector2;
    readonly bottomRight: Vector2;
    readonly topCenter: Vector2;
    readonly bottomCenter: Vector2;
    readonly leftCenter: Vector2;
    readonly rightCenter: Vector2;
    /** Sum of this node's and all ancestors' rotations, in degrees clockwise. */
    readonly rotation: number;
    /** Product of this node's and all ancestors' scale factors. */
    readonly scale: number;
    /**
     * Product of this node's and all ancestors' opacities, in `[0, 1]` — the
     * effective alpha the node renders at. Matches the renderer's pass-through
     * fold: an ancestor at half opacity halves everything beneath it.
     */
    readonly opacity: number;
}

/**
 * Fractional offsets (0–1) of each anchor within the node's bounding box.
 * `wx` = fraction of width, `hy` = fraction of height.
 */
const ANCHOR_OFFSETS: Record<AnchorKey, { wx: number; hy: number }> = {
    topLeft: { wx: 0, hy: 0 },
    topCenter: { wx: 0.5, hy: 0 },
    topRight: { wx: 1, hy: 0 },
    leftCenter: { wx: 0, hy: 0.5 },
    center: { wx: 0.5, hy: 0.5 },
    rightCenter: { wx: 1, hy: 0.5 },
    bottomLeft: { wx: 0, hy: 1 },
    bottomCenter: { wx: 0.5, hy: 1 },
    bottomRight: { wx: 1, hy: 1 },
};

const ANCHOR_KEYS = Object.keys(ANCHOR_OFFSETS) as AnchorKey[];

/** Convert ANCHOR_OFFSETS fractions to a normalised pivot: wx=0→-1, wx=1→+1; hy=0→+1, hy=1→-1 */
function anchorToPivot(offset: { wx: number; hy: number }): Vector2 {
    return { x: (offset.wx - 0.5) * 2, y: -(offset.hy - 0.5) * 2 };
}

function validateAnchorProps(props: Record<string, unknown>): void {
    const presentAnchors = ANCHOR_KEYS.filter(k => props[k] !== undefined);
    if (presentAnchors.length > 1) {
        throw new Error(`Cannot set multiple anchor props at once: ${presentAnchors.join(', ')}`);
    }
    if (presentAnchors.length === 1 && props['pivot'] !== undefined) {
        throw new Error(`Cannot set both anchor prop '${presentAnchors[0]}' and 'pivot' at the same time`);
    }
}

export interface NodeProps {
    x: number;
    y: number;
    width: SizeInput;
    height: SizeInput;
    scale: number;
    rotation: number;
    opacity: number;
    /** Layer blend mode. `'pass-through'` (default) does not isolate the node — its opacity scales each child/fill while they blend against the backdrop. Any other mode isolates the node and blends its flattened result against the backdrop. */
    blend: NodeBlendMode;
    effects: Effect;
    /** Inner spacing between this node's edges and its content/children. */
    padding: Padding;
    /** When true, content drawn outside this node's outline is clipped away (see {@link Node.clipSelf}). */
    clip: boolean;
    children: Node | Node[];

    /** Pivot point for rotation and scale. (0,0)=center, (-1,1)=top-left, (1,-1)=bottom-right. Set automatically when an anchor prop is used. */
    pivot: Vector2;

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
    leftCenter: Vector2 | (() => Vector2);
    rightCenter: Vector2 | (() => Vector2);

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
    // Author-facing layout/effect props. Like `fill`, the declared type is the
    // loose `Effect`/`Padding` so assignment (`this.padding = 3`,
    // `this.effects = FX.blur(4)`) and reads share one simple type. At runtime
    // the @property accessor stores the *resolved* value (via the mapper), and
    // consumers that need the resolved shape cast at the read site.
    @property({ default: [], tween: lerpEffectArray, mapper: resolveChainEffects }) declare effects: Effect;
    @property({ default: 0, mapper: resolvePadding, tween: lerpEdgeInset }) declare padding: Padding;
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 }) declare readonly pivot: Vector2;

    /** When true, content drawn by this node's children is clipped to its outline (see {@link clipSelf}). */
    @property({ default: false }) declare clip: boolean;

    @property({ default: 1 }) declare flex: number;
    @property({ default: undefined }) declare column: number | undefined;
    @property({ default: undefined }) declare row: number | undefined;
    @property({ default: 1 }) declare colSpan: number;
    @property({ default: 1 }) declare rowSpan: number;

    private readonly _layoutRect = new Signal<BoxBounds>({ x: 0, y: 0, width: 0, height: 0 });
    protected constraints!: SizeConstraints;

    /** The allocated bounding box from the last layout pass. Reactive — reads inside callbacks are tracked. */
    protected get layoutRect(): BoxBounds { return this._layoutRect.get(); }

    protected _children: Node[] = [];

    constructor(props?: NodeConfig<any, P>) {
        if (props?.ref) {
            props.ref(this as any);
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

        // Anchor-based positioning: validate, derive pivot, bind x/y.
        if (props) {
            validateAnchorProps(props as Record<string, unknown>);
            const anchorKey = ANCHOR_KEYS.find(k => (props as any)[k] !== undefined);
            if (anchorKey) {
                const raw = (props as any)[anchorKey] as Vector2 | (() => Vector2);
                const getTarget: () => Vector2 = typeof raw === 'function' ? raw : () => raw;
                const offset = ANCHOR_OFFSETS[anchorKey];
                this._writeProp('pivot', anchorToPivot(offset));
                this._writeProp('x', () => {
                    const r = this._layoutRect.get();
                    return getTarget().x + (0.5 - offset.wx) * r.width;
                });
                this._writeProp('y', () => {
                    const r = this._layoutRect.get();
                    return getTarget().y - (0.5 - offset.hy) * r.height;
                });
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
     */
    protected applyDefaultSize(props?: NodeConfig<any, P>): void {
        const childProp = props ? (props as any).children : undefined;
        const hasChildren = Array.isArray(childProp) ? childProp.length > 0 : !!childProp;
        const defaultSize = hasChildren ? "hug" : "fill";
        if (!props || props.width === undefined) this.applyProp("width", defaultSize, { tween: lerpSizeInput });
        if (!props || props.height === undefined) this.applyProp("height", defaultSize, { tween: lerpSizeInput });
    }

    // ---- Reactive properties ----------------------------------------------

    /**
     * Re-create this node's reactive signals from their @property defaults.
     *
     * `dispose()` is terminal — it frees every signal and sets `__signals` to
     * undefined. Scene roots, however, are owned by the project config and
     * outlive any single playback controller: under React StrictMode (and on
     * HMR) a controller is created, disposed, then a new one reuses the *same*
     * scene instances. Those reused instances would otherwise be left with
     * disposed signals, so reading e.g. `this.stroke` returns undefined and
     * `effectivePadding()` crashes on the next measure.
     *
     * Calling this restores the signals to their `@property`-default baseline. It
     * is a no-op when signals already exist (the common, non-disposed case), so
     * it's safe to call unconditionally before a rebuild. Subclasses that apply
     * constructor-specific prop defaults (e.g. {@link Rect}) override this to
     * re-apply those after calling `super.reinitProps()`.
     */
    protected reinitProps(): void {
        if (this.__signals) return;
        for (const meta of getPropertyMeta(this)) {
            this.applyProp(meta.key, meta.default, meta.options);
        }
    }

    /**
     * Public entry point to {@link reinitProps}. A {@link Scene} owns its root
     * node by composition (it no longer *is* a node), so it can't reach the
     * protected `reinitProps` directly — it calls this on its root before a
     * rebuild to restore default-baseline signals after a prior dispose.
     */
    public reinit(): void {
        this.reinitProps();
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
        const existing = this.__signals?.get(field);
        if (!existing) {
            this._registerProp<Ext, Int>(field, options);
        } else if (options) {
            // Allow subclasses to refine tween/mapper on an inherited field.
            if (options.tween) {
                if (!this.__tweens) this.__tweens = new Map();
                this.__tweens.set(field, options.tween as TweenFn<any>);
            }
            if (options.mapper) {
                if (!this.__mappers) this.__mappers = new Map();
                this.__mappers.set(field, options.mapper as (ext: any, prev?: any) => any);
            }
        }
        this._writeProp(field, initial);
    }

    private _registerProp<Ext, Int>(field: string, options?: PropOptions<Ext, Int>): void {
        const cell = new Signal<Int>(undefined as unknown as Int);
        if (!this.__signals) this.__signals = new Map();
        this.__signals.set(field, cell);
        if (!this.__upgraders) this.__upgraders = new Map();
        this.__upgraders.set(field, () => cell);
        if (options?.tween) {
            if (!this.__tweens) this.__tweens = new Map();
            this.__tweens.set(field, options.tween as TweenFn<any>);
        }
        if (options?.mapper) {
            if (!this.__mappers) this.__mappers = new Map();
            this.__mappers.set(field, options.mapper as (ext: any, prev?: any) => any);
        }
        Object.defineProperty(this, field, {
            get: () => cell.get(),
            set: (value: any) => this._writeProp(field, value),
            enumerable: true,
            configurable: true,
        });
    }

    protected _writeProp(field: string, value: unknown): void {
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
        const result: Record<string, any> = {};
        if (this.__upgraders) {
            for (const key of this.__upgraders.keys()) {
                result[key] = (this as any)[key];
            }
        }
        return result as P;
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
        for (const key in props) {
            const val = (props as any)[key];
            if (val !== undefined && signals.has(key)) this._writeProp(key, val);
        }
    }

    to(to: Partial<P>, duration: number, easing?: EaseFunction): AnimationBuilder<P> {
        return new AnimationBuilder<P>(this, { to, duration, easing });
    }

    /**
     * Resolve a single `to()` step into a flat {@link TweenStepper} — all the
     * per-key setup (anchor handling, mapper, numeric-vs-custom routing) happens
     * once here, then `advance(dt)` is allocation-free. Used by both the
     * generator path (`_toGen`) and the batched `parallel` path.
     */
    _prepareStep(to: Partial<P>, duration: number, easing?: EaseFunction): TweenStepper {
        validateAnchorProps(to as Record<string, unknown>);

        // If an anchor key is in the tween target, resolve it to x/y targets and set pivot.
        const anchorKey = ANCHOR_KEYS.find(k => (to as any)[k] !== undefined);
        if (anchorKey) {
            const raw = (to as any)[anchorKey] as Vector2;
            const offset = ANCHOR_OFFSETS[anchorKey];
            const r = this._layoutRect.get();
            this._writeProp('pivot', anchorToPivot(offset));
            (to as any).x = raw.x + (0.5 - offset.wx) * r.width;
            (to as any).y = raw.y - (0.5 - offset.hy) * r.height;
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

    *_toGen(to: Partial<P>, duration: number, easing?: EaseFunction): FrameGenerator {
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
    *moveTo(x: number, y: number, duration: number, ease?: EaseFunction): FrameGenerator {
        return yield* this.to({ x, y } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the horizontal position (`x`).
     *
     * @example
     * yield* node.moveX(300, 0.4);
     */
    *moveX(x: number, duration: number, ease?: EaseFunction): FrameGenerator {
        return yield* this.to({ x } as Partial<P>, duration, ease);
    }

    /**
     * Animate only the vertical position (`y`).
     *
     * @example
     * yield* node.moveY(-50, 0.4);
     */
    *moveY(y: number, duration: number, ease?: EaseFunction): FrameGenerator {
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
    *fadeTo(opacity: number, duration: number, ease?: EaseFunction): FrameGenerator {
        return yield* this.to({ opacity } as Partial<P>, duration, ease);
    }

    /**
     * Animate `rotate` to the target angle (degrees, clockwise).
     *
     * @example
     * yield* node.rotateTo(180, 0.6, ease.inOutQuad);
     */
    *rotateTo(rotation: number, duration: number, ease?: EaseFunction): FrameGenerator {
        return yield* this.to({ rotation } as Partial<P>, duration, ease);
    }

    /**
     * Animate `scale` to the target factor.
     *
     * @example
     * yield* node.scaleTo(1.5, 0.4);   // grow
     * yield* node.scaleTo(0,   0.3);   // shrink to nothing
     */
    *scaleTo(scale: number, duration: number, ease?: EaseFunction): FrameGenerator {
        return yield* this.to({ scale } as Partial<P>, duration, ease);
    }

    // ---- State stack (save / restore) -------------------------------------
    // A per-node LIFO stack of property snapshots, mirroring Motion Canvas's
    // node.save()/restore(). `save()` pushes a snapshot of every reactive prop;
    // `restore()` pops the most recent one and either snaps to it (no duration)
    // or tweens the numeric props back to it over `duration`.

    private _stateStack: Map<string, SignalSnapshot<any>>[] = [];

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
        const signals = this.__signals;
        if (!signals) return;
        const layer = new Map<string, SignalSnapshot<any>>();
        for (const [key, cell] of signals) {
            layer.set(key, cell.snapshot());
        }
        this._stateStack.push(layer);
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
    restore(duration: number, easing?: EaseFunction): FrameGenerator;
    restore(duration?: number, easing?: EaseFunction): void | FrameGenerator {
        const layer = this._stateStack.pop();
        if (duration === undefined || duration <= 0) {
            if (layer) this._applySnapshotLayer(layer);
            return;
        }
        return this._restoreAnimated(layer, duration, easing);
    }

    /** Instantly reapply a saved snapshot layer to every captured cell. */
    private _applySnapshotLayer(layer: Map<string, SignalSnapshot<any>>): void {
        const signals = this.__signals;
        if (!signals) return;
        for (const [key, snap] of layer) {
            signals.get(key)?.restoreFrom(snap);
        }
    }

    private *_restoreAnimated(
        layer: Map<string, SignalSnapshot<any>> | undefined,
        duration: number,
        easing?: EaseFunction,
    ): FrameGenerator {
        if (!layer) { yield* this._toGen({} as Partial<P>, duration, easing); return; }

        // Tween the numeric / custom-tweenable props toward their saved
        // resolved values. `to()` reads the snapshot's resolved `value` (correct
        // even for a bound cell), so the node animates to where it *was*.
        const target: Record<string, unknown> = {};
        for (const [key, snap] of layer) {
            target[key] = snap.value;
        }
        yield* this._toGen(target as Partial<P>, duration, easing);

        // Reapply the full snapshot so reactive bindings are restored (not left
        // frozen at the value the tween landed on) and non-tweened props snap.
        this._applySnapshotLayer(layer);
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
        if (!this._clock.initialized) {
            this._clock.creation = totalTime;
            this._clock.initialized = true;
        }
        this._clock.time = totalTime;
        this._clock.elapsed = totalTime - this._clock.creation;

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
        this._assets = context;
        for (const child of this._children) child.bindAssets(context);
    }

    /**
     * Register the assets this node needs resolved **before layout** — chiefly
     * fonts, whose metrics text measurement depends on. Runs in the precomp pass
     * ahead of {@link layout}, so the node cannot read its `layoutRect` here (it
     * hasn't been laid out yet). No-op by default; {@link Text}/{@link RichText}
     * (and `Code`) override it to request their typefaces.
     */
    prepareLayout(_storage: AssetTracker): void {

    }

    /**
     * Register the assets this node needs resolved **before render** — images,
     * video, audio, and fill/stroke/shadow paint. Runs *after* {@link layout},
     * so the node can read its `layoutRect` to size decodes (image/video
     * resolution, gradient extents). No-op by default; {@link ShapeNode},
     * {@link Image}, and {@link Video} override it.
     */
    prepareRender(_storage: AssetTracker): void {

    }

    /**
     * Walk the subtree registering each node's **pre-layout** assets (fonts).
     * Run before {@link layout} so text can be measured with the correct metrics.
     * Mirrors {@link prepareRenderAssets} but drives {@link prepareLayout}.
     */
    prepareLayoutAssets(storage: AssetTracker, path: string = ""): void {
        storage.withOwnerPath(path, () => this.prepareLayout(storage));
        const children = this._children;
        for (let i = 0; i < children.length; i++) {
            children[i].prepareLayoutAssets(storage, nodePath(path, i));
        }
    }

    /**
     * Walk the subtree registering each node's **pre-render** assets (images,
     * video, audio, paint). Run after {@link layout} so each node's `layoutRect`
     * is available to size its decodes. Mirrors {@link prepareLayoutAssets} but
     * drives {@link prepareRender}.
     */
    prepareRenderAssets(storage: AssetTracker, path: string = ""): void {
        // Stamp the owning node's structural path onto any audio requests this
        // node emits, so the timeline can draw each clip on its own bar. Purely
        // for display — playback ignores ownerPath.
        storage.withOwnerPath(path, () => this.prepareRender(storage));
        const children = this._children;
        for (let i = 0; i < children.length; i++) {
            children[i].prepareRenderAssets(storage, nodePath(path, i));
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
        const deg = this.rotation;
        if (deg === 0) return { x: this.x + ox, y: this.y + oy };
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // Canvas rotation is clockwise; in y-up space that means x'= cos*ox + sin*oy, y'= -sin*ox + cos*oy
        return {
            x: this.x + cos * ox + sin * oy,
            y: this.y - sin * ox + cos * oy,
        };
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

    get leftCenter(): Vector2 {
        const r = this.layoutRect;
        return this._rotateOffset(-r.width / 2, 0);
    }

    get rightCenter(): Vector2 {
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
    private _localMatrix(): Matrix2D {
        const r = this.layoutRect;
        const cx = (r?.x ?? 0) + this.x;
        const cy = (r?.y ?? 0) - this.y;
        const pivot = this.pivot;
        const pivotX = pivot.x * ((r?.width ?? 0) / 2);
        const pivotY = -pivot.y * ((r?.height ?? 0) / 2);
        return nodeLocalMatrix(cx, cy, this.rotation, this.scale, pivotX, pivotY);
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
        const m = this.worldMatrix();
        const r = this.layoutRect;
        const hw = (r?.width ?? 0) / 2;
        const hh = (r?.height ?? 0) / 2;

        // Map a node-local centered offset (y-up, like the local anchor getters)
        // through the world matrix, returning a y-up world position. The matrix
        // works in canvas (y-down) space, so flip y in and back out.
        const at = (ox: number, oy: number): Vector2 => {
            const p = applyToPoint(m, { x: ox, y: -oy });
            return { x: p.x, y: -p.y };
        };

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

        const center = at(0, 0);
        return {
            x: center.x,
            y: center.y,
            center,
            topLeft: at(-hw, hh),
            topRight: at(hw, hh),
            bottomLeft: at(-hw, -hh),
            bottomRight: at(hw, -hh),
            topCenter: at(0, hh),
            bottomCenter: at(0, -hh),
            leftCenter: at(-hw, 0),
            rightCenter: at(hw, 0),
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

    addChild(child: Node): void {
        this._children.push(child);
        child._parent = this;
        const assets = this.tryAssets();
        if (assets) child.bindAssets(assets);
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
    }

    clearChildren(): void {
        for (const child of this._children) child._parent = null;
        this._children.length = 0;
    }

    addChildAt(child: Node, index: number): void;
    addChildAt(child: Node, index: number, duration: number, easing?: EaseFunction): FrameGenerator;
    addChildAt(child: Node, index: number, duration?: number, easing?: EaseFunction): void | FrameGenerator {
        if (duration === undefined) {
            this._children.splice(index, 0, child);
            child._parent = this;
            const assets = this.tryAssets();
            if (assets) child.bindAssets(assets);
            return;
        }
        return this._addChildAtAnimated(child, index, duration, easing);
    }

    removeChildAt(index: number): Node | null;
    removeChildAt(index: number, duration: number, easing?: EaseFunction): FrameGenerator;
    removeChildAt(index: number, duration?: number, easing?: EaseFunction): (Node | null) | FrameGenerator {
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

    /** Largest frame delta we trust for a velocity estimate (seconds). Larger gaps (scrub/seek) read as "unknown". */
    private static readonly MAX_MOTION_DT = 0.2;

    private _prevRenderPos: Vector2 | null = null;
    private _prevRenderTime = 0;
    private _prevRotation = 0;
    private _prevScale = 1;

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
        const r = this.layoutRect;
        const x = (r?.x ?? 0) + this.x;
        const y = (r?.y ?? 0) - this.y;
        const rotation = this.rotation;
        const scale = this.scale;

        const now = this._clock.time;
        const dt = now - this._prevRenderTime;
        const s = this._renderState;

        const prev = this._prevRenderPos;
        if (prev && dt > 0 && dt <= Node.MAX_MOTION_DT) {
            const vx = (x - prev.x) / dt;
            const vy = (y - prev.y) / dt;
            s.dt = dt;
            s.velocity.x = vx;
            s.velocity.y = vy;
            s.speed = Math.hypot(vx, vy);
            s.direction = (Math.atan2(vy, vx) * 180) / Math.PI;
            s.angularVelocity = (rotation - this._prevRotation) / dt;
            s.scaleVelocity = (scale - this._prevScale) / dt;
        } else {
            s.dt = 0;
            s.velocity.x = 0;
            s.velocity.y = 0;
            s.speed = 0;
            s.direction = 0;
            s.angularVelocity = 0;
            s.scaleVelocity = 0;
        }

        if (!prev) this._prevRenderPos = { x, y };
        else { prev.x = x; prev.y = y; }
        this._prevRenderTime = now;
        this._prevRotation = rotation;
        this._prevScale = scale;
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
        s.pivot = this.pivot;
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
     * Does `effect` target the backdrop (the content painted beneath this node)
     * rather than the node's own content? `magnify` and backdrop-mode `sksl`
     * always do; everything else opts in via the `backdrop` flag (the filter
     * effects and posterize). The renderer decides per effect whether to express
     * it as an ImageFilter or a shader — callers only pick the target.
     */
    private static isBackdropEffect(effect: SceneEffect): boolean {
        if (effect.type === "magnify") return true;
        if (effect.type === "sksl") return effect.mode === "backdrop";
        return "backdrop" in effect && effect.backdrop === true;
    }

    /**
     * Apply backdrop effects (any `backdrop`-flagged filter effect — blur,
     * grayscale, …; plus magnify and backdrop SkSL) beneath this node, clipped to
     * its silhouette, before the node's own content is drawn — so the content
     * underneath is filtered/warped while the node's own edges stay sharp. One
     * backdrop effect scope, confined to the silhouette clip, runs the lot; the
     * renderer routes each effect to a filter or shader pass. A no-op for nodes
     * without a {@link clipSelf} outline (there's no silhouette to confine to).
     */
    private applyBackdropEffects(ctx: RenderContext): void {
        const backdropEffects = (this.effects as SceneEffect[]).filter(Node.isBackdropEffect);
        if (backdropEffects.length === 0) return;

        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return;

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Clip to the silhouette first so the backdrop passes are confined to the
        // node; the renderer opens its backdrop layers within that clip.
        ctx.beginClip(clip);
        ctx.beginEffectScope(backdropEffects, "backdrop", w, h);
        ctx.endEffectScope();
        ctx.endClip();
    }

    /**
     * Effects that warp/band this node's *own* content (self + children), in the
     * order they should compose: posterize wraps bulge, so it comes first and the
     * renderer applies bulge inside it (mirroring how blur-style content effects
     * nest). `backdrop`-flagged posterize bands the backdrop instead (see
     * {@link applyBackdropEffects}), so it's excluded here.
     */
    private foregroundShaderEffects(): SceneEffect[] {
        const effects = this.effects as SceneEffect[];
        const posterize = effects.find((e) => e.type === "posterize" && e.backdrop !== true);
        const bulge = effects.find((e) => e.type === "bulge");
        const out: SceneEffect[] = [];
        if (posterize) out.push(posterize);
        if (bulge) out.push(bulge);
        return out;
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

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Capture everything this node paints — its own content and its children —
        // so the foreground shader effects (posterize wrapping bulge) warp/band the
        // lot, mirroring how blur-style content effects compose.
        const foreground = this.foregroundShaderEffects();
        const hasForeground = foreground.length > 0;
        if (hasForeground) ctx.beginEffectScope(foreground, "foreground", w, h);

        // A clipPath cuts through this node's own paint *and* its children, so it
        // wraps the whole body. Opened first, the node's own content is clipped
        // too — distinct from `clip`, which only confines children. Skipped when
        // the path is empty so endClip() balances.
        const clipPath = this.clipPathSelf();
        const pathClipped = clipPath != null && !clipPath.isEmpty();
        if (pathClipped) ctx.beginClip(clipPath);

        body();

        if (pathClipped) ctx.endClip();

        if (hasForeground) ctx.endEffectScope();
    }

    onRender(ctx: RenderContext): void {
        this.applyTransform(ctx);
        this.renderContentWithEffects(ctx, () => {
            this.renderSelf(ctx);
            // Confine children to this node's outline. Built once from clipSelf();
            // skipped when the node has no outline (clipped === false) so the
            // endClip() below stays balanced.
            const clipped = this.clip && this.applyClip(ctx);
            this.renderChildren(ctx);
            if (clipped) ctx.endClip();
        });
    }

    renderChildren(ctx: RenderContext): void {
        for (const child of this._children) child.render(ctx);
    }

    beforeRender(ctx: RenderContext): void {
        // Motion fields were already sampled in ellapse() this frame. Only the
        // layout-dependent fields are resolved here, where layout is current.
        const s = this._renderState;
        s.rects = this._spaceRects();
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
        const parent = this._parent;
        if (!parent) return {};
        const p = parent.layoutRect;
        const r = this.layoutRect;
        // This node's local origin within the parent's space.
        const ox = r.x + this.x;
        const oy = r.y - this.y;
        return {
            parent: {
                left: -p.width / 2 - ox,
                top: -p.height / 2 - oy,
                right: p.width / 2 - ox,
                bottom: p.height / 2 - oy,
            },
        };
    }

    afterRender(ctx: RenderContext): void {
        ctx.end();
    }

    render(ctx: RenderContext): void {
        this.beforeRender(ctx);
        this.onRender(ctx);
        this.afterRender(ctx);
    }

    // ---- Layout -----------------------------------------------------------

    private readonly _measuredSize: Partial<Size2D> = {};

    /** Record this node's allocated bounds without touching children. Used by subclasses that run their own child-layout pass (e.g. `Rect`'s flex/stack) and so skip {@link layoutChildren}. */
    protected setLayoutRect(rect: BoxBounds): void {
        this._layoutRect.set(rect);
    }

    /**
     * Default layout: record `rect`, then stack-layout children (see
     * {@link layoutChildren}). This is what makes a plain `Node` — and any
     * `ShapeNode` leaf (`Ellipse`, `Polygon`, …) that doesn't override
     * `layout` — able to nest children out of the box, the same way `Image`
     * (via `Rect`) does, just with simple centered stacking instead of
     * flex/stack. Subclasses with their own child-layout (`Rect`,
     * `MaskGroup`, `Camera`, `BooleanGroup`) override this and call
     * {@link setLayoutRect} instead, so children aren't laid out twice.
     */
    layout(rect: BoxBounds, scope: MeasureScope): void {
        this.setLayoutRect(rect);
        this.layoutChildren(rect, scope);
    }

    /**
     * Stack-layout this node's children, centered within `rect`: each child is
     * measured against `rect` and given a `BoxBounds` centered on it (sized to
     * its own measured size, capped to the container), offsetting from center
     * via its own `x`/`y`. Called by the default {@link layout}; nodes that run
     * their own child-layout (`Rect`'s flex/stack, `Camera`'s viewport, …)
     * override `layout` instead and don't call this.
     */
    protected layoutChildren(rect: BoxBounds, scope: MeasureScope): void {
        layoutGroupChildren(this._children, rect, scope);
    }

    measure(constraints: SizeConstraints, _scope: MeasureScope): Partial<Size2D> {
        this.constraints = constraints;

        const maxW = constraints.maxWidth ?? 0;
        const maxH = constraints.maxHeight ?? 0;
        this._measuredSize.width = resolveSize(this.width, maxW, 0);
        this._measuredSize.height = resolveSize(this.height, maxH, 0);
        return this._measuredSize;
    }

    // ---- Reparenting ------------------------------------------------------

    reparent(newParent: Node): void;
    reparent(newParent: Node, duration: number, easing?: EaseFunction): FrameGenerator;
    reparent(newParent: Node, duration?: number, easing?: EaseFunction): void | FrameGenerator {
        if (duration === undefined) {
            const old = this.parent;
            if (old) old.removeChild(this);
            newParent.addChild(this);
            return;
        }
        return this._reparentAnimated(newParent, duration, easing);
    }

    private *_reparentAnimated(newParent: Node, duration: number, easing?: EaseFunction): FrameGenerator {
        const half = duration / 2;
        const targetOpacity = this.opacity;

        // Pin to current rendered size so exit shrink reflows the old parent.
        const lw = this.layoutRect?.width;
        const lh = this.layoutRect?.height;
        const hasSizeAnim = lw !== undefined && lh !== undefined;
        if (hasSizeAnim) {
            this.set({ width: lw, height: lh } as Partial<P>);
        }

        const exitProps: Partial<NodeProps> = { opacity: 0 };
        if (hasSizeAnim) { exitProps.width = 0; exitProps.height = 0; }
        yield* this.to(exitProps as Partial<P>, half, easing);

        const old = this.parent;
        if (old) old.removeChild(this);
        newParent.addChild(this);

        const enterProps: Partial<NodeProps> = { opacity: targetOpacity };
        if (hasSizeAnim) { enterProps.width = lw; enterProps.height = lh; }
        yield* this.to(enterProps as Partial<P>, half, easing);
    }

    private *_addChildAtAnimated(child: Node, index: number, duration: number, easing?: EaseFunction): FrameGenerator {
        const targetOpacity = child.opacity;
        const isNumericW = typeof child.width === 'number';
        const isNumericH = typeof child.height === 'number';
        const targetW = isNumericW ? (child.width as number) : 0;
        const targetH = isNumericH ? (child.height as number) : 0;

        child.set({
            opacity: 0,
            width: isNumericW ? 0 : undefined,
            height: isNumericH ? 0 : undefined,
        } as Partial<NodeProps>);

        this._children.splice(index, 0, child);
        child._parent = this;
        const assets = this.tryAssets();
        if (assets) child.bindAssets(assets);

        const toProps: Partial<NodeProps> = { opacity: targetOpacity };
        if (isNumericW) toProps.width = targetW;
        if (isNumericH) toProps.height = targetH;
        yield* child.to(toProps as Partial<NodeProps>, duration, easing);
    }

    private *_removeChildAtAnimated(index: number, duration: number, easing?: EaseFunction): FrameGenerator {
        if (index < 0 || index >= this._children.length) return;
        const child = this._children[index];
        // Pin to current rendered size so the shrink reflows siblings in the parent layout.
        const lw = child.layoutRect?.width;
        const lh = child.layoutRect?.height;
        child.set({ width: lw, height: lh } as Partial<NodeProps>);

        const toProps: Partial<NodeProps> = { opacity: 0 };
        if (lw !== undefined) toProps.width = 0;
        if (lh !== undefined) toProps.height = 0;
        yield* child.to(toProps as Partial<NodeProps>, duration, easing);

        this._children.splice(index, 1);
        child._parent = null;
    }

    // ---- Teardown ---------------------------------------------------------

    dispose(): void {
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
    }
}
