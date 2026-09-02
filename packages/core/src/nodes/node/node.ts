import { Signal } from "@/signals/signal";
import { SignalHost, type SignalCells } from "@/signals/host";
import { EasingFunction } from "@/tween/ease/type";
import { toCommand } from "@/tween/to-command";
import { makeCommand, type Command, type CommandTarget } from "@/tween/command";
import { prepareNumericCellTween } from "@/tween/prepare";
import { inertCommand, inertStepper } from "@/tween/inert";
import { TweenStepper } from "@/tween/stepper";
import { RefTarget } from "@/util/reference";
import { Context, ContextMap } from "@/util/context";
import { AssetCatalog } from "@/assets/catalog";
import { AssetTracker } from "@/assets/tracker";
import { getPropertyMeta, PropOptions } from "@/attributes/properties/decorator";
import {
    applyProp,
    applySnapshotLayer,
    collectProperties,
    popState,
    restoreAnimated,
    saveState,
} from "./node-reactive";
import type { PropLayer } from "./node-reactive";
import { advanceNodeTime, createNodeTime, type MutableNodeTime, type NodeTime } from "@/nodes/node/node-time";
import type { PropInputs } from "@/attributes/properties/inputs";
import { command } from "@/tween/command-decorator";

export type { NodeTime } from "@/nodes/node/node-time";
export type { PropInput, PropInputs } from "@/attributes/properties/inputs";

/** Which scene graph a node belongs to. See {@link Node.dimension}. */
export type NodeDimension = "2d" | "3d";

export interface NodeMetadata<T extends Node> {
    /**
     * Handle written with this node at construction. Typed as {@link RefTarget}
     * rather than `Reference<T>` so a ref declared as one of `T`'s *supertypes*
     * is accepted (`createRef<ShapeNode>()` on a `<Rect>`) — see the note there
     * for why that direction is the sound one.
     */
    ref?: RefTarget<T>;
}

export type NodeConfig<T extends Node, P> = PropInputs<P> & NodeMetadata<T>;

/**
 * Everything {@link Node.attach} needs to put a subtree into a live scene.
 *
 * The three things tree membership supplies, and the only three: what assets are
 * available, what context the ancestors provide, and where the playhead is.
 */
export interface AttachScope {
    /** Metadata for the assets this scene may declare. */
    assets: AssetCatalog;
    /** The token map the parent provides to this node. */
    context: ContextMap;
    /** Scene-relative time, in seconds. */
    time: number;
}

/**
 * A JSX/`children` child: a single {@link Node}, an arbitrarily-nested array of
 * children, or a falsy value. Nesting is allowed so `.map()` results can be
 * dropped straight in as a child, and falsy values are allowed so
 * `{condition && <Node/>}` works like in React — the constructor flattens
 * (`.flat(Infinity)`) and filters out everything but `Node` instances.
 */
export type NodeChildren = Node | false | null | undefined | NodeChildren[];

/**
 * The props every node has, in either dimension.
 *
 * Deliberately tiny. Everything that reads as "a box on a page" — `x`/`y`,
 * `width`/`height`, `padding`, `flex`, anchors, `opacity` — lives on
 * {@link Node2DProps}, and everything that reads as "a thing in space" —
 * `position`, `quaternion`, `castShadow` — lives on `Node3DProps`, because a
 * prop that means nothing for half the tree is worse than no prop at all.
 */
export interface NodeProps {
    children: NodeChildren;
}

/**
 * The dimension-agnostic base of the scene graph.
 *
 * `Node` owns everything that is true of a node whatever space it lives in: the
 * tree itself, identity, the reactive property system, the command/tween API,
 * inherited context, the per-node clock, asset declaration and teardown. It owns
 * nothing about *where* a node is or *how* it draws, because those are the two
 * things 2D and 3D genuinely disagree about.
 *
 * Two subclasses divide that up:
 *
 * - {@link Node2D} — laid out in a flex/stack box on the page, drawn through a
 *   {@link RenderContext2D}. Everything with a `width`, an anchor or a fill.
 * - `Node3D` — positioned in space by a `Transform3D`, drawn through a
 *   `RenderContext3D`. Meshes, lights, cameras, fog.
 *
 * The two trees meet at exactly one place: `Canvas3D`, a `Node2D` that hosts
 * `Node3D` children and paints what they describe through its own path. Mixing
 * them anywhere else throws — see {@link acceptsChild}.
 *
 * **Reactive properties** — fields declared with `@property()` are backed by
 * `Signal`s. Reading them inside a reactive context (e.g. a render pass) creates
 * a subscription; writing them propagates the change automatically. Use
 * {@link set} to update props imperatively, or pass a callback `() => expr` to
 * bind a prop to a derived value.
 *
 * **Tweening** — `to(props, duration, ease?)` returns a {@link Command}
 * that animates one or more props to target values over the given duration (in
 * seconds). It is both a {@link Command} (evaluable at a time via `at(t)`) and
 * iterable, so `node.to(...)` works.
 *
 * Subclasses call {@link initProps} from their own constructor rather than
 * having the base do it: a subclass's field initializers only run *after*
 * `super()` returns, so applying `@property` defaults from here would write into
 * cells whose owning fields (a layout rect, a transform scratch) do not exist
 * yet. Deferring one call to the concrete constructor is what keeps that honest.
 */
export abstract class Node<P extends NodeProps = NodeProps> implements SignalHost {
    /**
     * Which scene graph this node belongs to.
     *
     * A getter rather than a field so it is answerable from the prototype during
     * construction, before any subclass field initializer has run.
     */
    abstract get dimension(): NodeDimension;

    constructor(props?: NodeConfig<any, P>) {
        // Retain the raw props (see _props doc) so a provider's provideContext can
        // read which keys the author passed. Captured before any default
        // application so it reflects exactly what the author passed. The object is
        // retained by reference, so a subclass expanding prop sugar in place
        // afterwards (`size`, `transform3D`) is reflected here too.
        this._props = props;
    }

    /**
     * Fire the `ref` and apply every `@property()`-decorated field, reading
     * initial values from `props`.
     *
     * Called by the concrete constructor ({@link Node2D}'s, `Node3D`'s) rather
     * than by this one, because a subclass's field initializers run *after*
     * `super()` returns: doing this here would apply props while the cells those
     * props write into are still `undefined`.
     */
    protected initProps(props?: NodeConfig<any, P>): void {
        if (props?.ref) {
            props.ref(this as any);
        }

        // Apply all @property()-decorated fields, reading initial values from props.
        for (const meta of getPropertyMeta(this)) {
            const propsVal = props ? (props as any)[meta.key] : undefined;
            const initial = propsVal !== undefined ? propsVal : meta.default;
            this.applyProp(meta.key, initial, meta.options);
        }
    }

    /**
     * Adopt the `children` prop. Called by the concrete constructor after its own
     * defaults are in place, so a child never lands in a tree whose parent has not
     * finished sizing itself.
     */
    protected adoptChildrenProp(props?: NodeConfig<any, P>): void {
        if (props && (props as any).children) {
            const raw = Array.isArray((props as any).children) ? (props as any).children : [(props as any).children];
            const flat = (raw as unknown[]).flat(Infinity)
                .filter((c: unknown): c is Node => c instanceof Node);
            if (flat.length > 0) this.addChildren(flat);
        }
    }

    /**
     * Whether `child` may be adopted by this node.
     *
     * A 2D node holds 2D children and a 3D node holds 3D children; the one place
     * the two meet is `Canvas3D`, which overrides this to accept both and then
     * partitions them (3D children build its scene, 2D children draw as a HUD
     * over it). Rejecting the mix here rather than letting it through is
     * deliberate: a `Box3D` parented to a `Rect` would be silently skipped by
     * both the layout walk and the 3D walk, and would simply never appear.
     */
    protected acceptsChild(child: Node): boolean {
        return child.dimension === this.dimension;
    }

    /** Throw if `child` belongs to the other dimension. */
    protected assertAcceptsChild(child: Node): void {
        if (this.acceptsChild(child)) return;
        throw new TypeError(
            `${this.name} (${this.dimension}) cannot hold ${child.name} (${child.dimension}). ` +
            `Put 3D nodes inside a <Canvas3D>, which is the one node that holds both.`,
        );
    }

    private _assets: AssetCatalog | null = null;
    protected _parent: Node | null = null;

    /**
     * Whether this node is part of a live scene tree.
     *
     * Set by {@link attach} and cleared by {@link detach}. It is what gates
     * measure, layout, render, the two asset-declaration walks, and every
     * command — a node that is not in the tree has no box to measure against, no
     * surface to draw on, and no timeline to animate on, so doing any of it
     * would be work against a frame that will never exist.
     *
     * Nothing checks this per method. The guards sit at the handful of places
     * the framework *dispatches* from — the child accessors a container walks,
     * the two declaration walks, {@link Node2D.render}, and the two funnels every
     * command is built through. That is what makes the rule hold for a subclass
     * override too, without any of them having to remember it.
     */
    private _mounted = false;

    /** See {@link _mounted}. */
    get mounted(): boolean {
        return this._mounted;
    }

    get parent(): Node | null {
        return this._parent;
    }

    get assets(): AssetCatalog {
        if (!this._assets) throw new Error("Assets not bound — this node is not attached to a scene. See Node.attach().");
        return this._assets;
    }

    // ---- Inherited context (createContext / Provider / useContext) --------
    // The token→value map pushed down from ancestor providers, bound by
    // `attach` — at the start of a pass for the tree, and on insertion for a
    // subtree added mid-frame. Reads resolve the nearest provider's value.
    private _context: ContextMap = ContextMap.EMPTY;
    /** True once {@link attach} has reached this node — gates pushing context to
     * children added afterwards, and is half of what {@link currentScope} needs
     * before it can hand a scope to a newcomer. */
    private _contextBound = false;

    /** The raw props this node was constructed with, retained past construction so
     * a provider's {@link provideContext} can see which keys the author explicitly
     * passed on every attach (e.g. `DefaultTextStyle` contributes only the style
     * keys it was given). Authored identity — deliberately kept through
     * {@link dispose} so a reused instance re-derives context from the next attach. */
    protected _props?: NodeConfig<any, P>;

    /** Read the nearest ancestor provider's value for `ctx` (or its default). */
    useContext<T>(ctx: Context<T>): T {
        return this._context.get(ctx);
    }

    readonly id: string = crypto.randomUUID();

    /**
     * The reactive cells behind this node's `@property` fields. See
     * {@link SignalCells}.
     *
     * @internal — the authoring surface is the declared props themselves, plus
     * `set()`/`to()`/`captureProps()`.
     */
    __cells?: SignalCells;

    /**
     * One of this node's cells went stale. Implements `SignalOwner`.
     *
     * Deliberately a no-op, and deliberately not propagating: nothing caches
     * anything derived from a node's cells. The renderer is immediate-mode —
     * `executePass` clears the surface and redraws the world every frame — so a
     * node that declines to emit its draw calls does not appear, which makes
     * "skip the clean subtree" the one thing a dirty flag here could never be
     * used for. Anything that does want to memoize a *rebuild* (never the walk,
     * never the draw) can start here.
     *
     * @internal
     */
    markDirty(): void { }

    protected _children: Node[] = [];

    /**
     * Flatten a constructor's raw `children` prop into the `Node` instances it
     * contains, without mutating or adding them — the same normalisation the
     * constructor applies before adding them, exposed standalone so
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

    // ---- Reactive properties ----------------------------------------------

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

    /** @internal Hot-path prop write (mapper- and binding-aware). Public-but-underscored like `_prepareStep` so reactive companions in this directory can call it; not part of the authoring surface. */
    _writeProp(field: string, value: unknown): void {
        if (value === undefined) return;
        const cell = this.__cells?.signals.get(field);
        if (!cell) return;
        const mapper = this.__cells?.mappers?.get(field);
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
        const signals = this.__cells?.signals;
        if (!signals) return;
        // Iterate the caller's keys (usually 1–3) rather than every registered
        // signal (15+): set() runs in the per-frame hot path. Only keys backed by
        // a signal are written; unknown keys are ignored — which is also what
        // lets a subclass distribute its own sugar (2D's `size`, `transform3D`)
        // into real keys and then delegate here.
        for (const key in props) {
            const val = (props as any)[key];
            if (val !== undefined && signals.has(key)) this._writeProp(key, val);
        }
    }

    @command()
    to(to: Partial<P>, duration: number, easing?: EasingFunction): Command<P> {
        return toCommand<P>(this, to, duration, easing);
    }

    /**
     * Build a {@link Command} from a pure function of normalized time — an
     * animation this node can be *evaluated* at, not only run through.
     *
     * The pair to {@link to}, and the seam a named command is written against.
     * `to()` covers "move these props there", which is most of it; this covers
     * everything a node wants to choreograph itself, where the values at time
     * `t` are a function the node knows and nobody outside could reconstruct
     * from a prop list.
     *
     * ```ts
     * @command()
     * draw(duration = 1, easing?: EasingFunction): Command<ChartProps> {
     *     const from = this.progress;
     *     return this.command((t) => ({ progress: lerpNumber(from, 1, t) }), duration, easing);
     * }
     * ```
     *
     * Snapshot whatever the animation starts from *outside* the callback, as
     * above — reading `this.progress` inside it would re-read the value the
     * command is itself writing, and the tween would chase its own tail.
     *
     * Prefer this over a `*method(): FrameGenerator`. A generator can only be
     * advanced, so a host that wants frame N has to run frames 0..N-1 to get it;
     * the same choreography as a `Command` can be asked directly.
     *
     * (The `@command()` above it is the *decorator*, which only records that the
     * method is offerable. This builds the thing it returns.)
     */
    protected command<Props = P>(
        at: (t: number) => Partial<Props>,
        duration: number = 1,
        easing?: EasingFunction,
    ): Command<Props> {
        if (!this._mounted) return inertCommand<Props>(this, duration);
        return makeCommand<Props>(
            this as unknown as CommandTarget<Props>,
            at,
            duration,
            easing,
        );
    }

    /**
     * Resolve a single `to()` step into a flat {@link TweenStepper} — all the
     * per-key setup (mapper, numeric-vs-custom routing) happens once here, then
     * `advance(dt)` is allocation-free. Used by both a chain's iterator path and
     * the batched `parallel` path.
     *
     * A subclass with positional sugar of its own (2D's `size` and anchors)
     * expands `to` in place and then delegates here.
     */
    _prepareStep(to: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper {
        if (!this._mounted) return inertStepper(duration);
        // Numeric, mapper-free props (x/y/scale/rotation/opacity) write straight
        // to their cell — no property-setter / mapper indirection per step.
        const numCells: Signal<number>[] = [];
        const numFrom: number[] = [];
        const numEnd: number[] = [];
        const customLerps: Array<(t: number) => void> = [];
        const stringSnaps: Array<[string, string]> = [];

        for (const key of Object.keys(to)) {
            const cell = this.__cells?.signals.get(key);
            if (!cell) continue;
            const extVal = (to as any)[key];
            // Map external → internal so the tween operates in stored space.
            const mapper = this.__cells?.mappers?.get(key);
            const targetVal = mapper ? mapper(extVal, (this as any)[key]) : extVal;
            const tweenFn = this.__cells?.tweens?.get(key);
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
            // A discrete prop has nothing between its endpoints, so it snaps at
            // the end rather than interpolating. Applied here rather than only in
            // `advance` because a `seek` past the end has, by definition, reached
            // that end — leaving it out meant `seek(duration)` and running to
            // `duration` produced different nodes, and only the second was right.
            if (hasSnaps && t >= 1) for (const [key, val] of stringSnaps) (this as any)[key] = val;
        };

        let elapsed = 0;
        return {
            // Tracks `elapsed`, so a seek and a subsequent advance agree about
            // where the tween is. Without it, seeking forward then advancing
            // rewound to `dt`.
            seek: (e: number) => {
                elapsed = e;
                apply(duration > 0 ? Math.min(e / duration, 1) : 1);
            },
            advance: (dt: number): boolean => {
                elapsed += dt;
                if (elapsed < duration) {
                    apply(elapsed / duration);
                    return false;
                }
                apply(1);
                return true;
            },
        };
    }

    // ---- State stack (save / restore) -------------------------------------
    // A per-node LIFO stack of property snapshots, mirroring Motion Canvas's
    // node.save()/restore(). `save()` pushes a snapshot of every reactive prop;
    // `restore()` pops the most recent one and either snaps to it (no duration)
    // or tweens the numeric props back to it over `duration`.

    /** @internal LIFO stack of save() snapshot layers. Underscore-internal so the reactive companion can read it; not authoring surface. */
    _stateStack: PropLayer[] = [];

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
     * node.moveTo(200, 0, 1);
     * node.restore(1);   // animate back to where it was saved
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
    restore(duration: number, easing?: EasingFunction): Command<Record<string, never>>;
    @command()
    restore(duration?: number, easing?: EasingFunction): void | Command<Record<string, never>> {
        const layer = popState(this);
        if (duration === undefined || duration <= 0) {
            if (layer) applySnapshotLayer(this, layer);
            return;
        }
        return restoreAnimated(this, layer, duration, easing);
    }

    // ---- Clock ------------------------------------------------------------

    protected _time: MutableNodeTime = createNodeTime();

    /**
     * Per-frame hook, called after this node's {@link time} has been advanced.
     *
     * Nothing to do in the general case. Override it for state that has to
     * follow the clock but isn't a signal — a {@link Video}'s audio playhead is
     * the one built-in example. Read `this.time` for the current frame.
     */
    public tick(): void { }

    /** This node's place on the scene clock. See {@link NodeTime}. */
    public get time(): NodeTime {
        return this._time;
    }

    /**
     * Advance **this node's** clock to `total` scene-seconds, tick it, and
     * sample its derived render state.
     *
     * Per-node, not per-subtree: {@link attach} already recurses, so a recursive
     * advance here would re-advance every descendant once per ancestor.
     *
     * Sampling happens here, not at render: this runs on every advanced frame in
     * every playback path (forward, scrub, precomp), whereas `render` runs only
     * for displayed frames. Sampling per-frame is what makes velocity correct on
     * the first frame after a scrub/rewind, where sampling only at render time
     * read zero. The advance loop runs before `generator.next()` (so audio
     * scheduling in generator bodies reads the right time), which means x/y here
     * still hold the previous frame's value — velocity therefore trails the
     * rendered position by one frame. That lag is constant and identical forward
     * vs. scrub, and imperceptible for motion blur.
     */
    private advanceOwnTime(total: number): void {
        advanceNodeTime(this._time, total);
        this.tick();
        this._sample();
    }

    /**
     * Sample this node's own derived render state for the current frame. Nothing
     * to derive in the general case; {@link Node2D} samples its motion here.
     *
     * @internal The per-node half of `sampleTree` — a walk, not a node method.
     */
    _sample(): void { }

    /**
     * Record this node's current position as the motion history's previous
     * frame, stamped `at`, deriving no velocity.
     *
     * @internal The per-node half of `primeMotionTree`.
     */
    _primeMotion(at: number): void { }

    // ---- Attachment -------------------------------------------------------

    /**
     * Put this subtree into the scene: mark it mounted, bind the asset catalog
     * and the inherited context, and advance its clock to `scope.time`.
     *
     * **One verb, because a node is not usable until all three have happened.**
     * They used to be three separate walks the runtime had to call in the right
     * order every frame (`bindAssets` → `bindContext` → `ellapse`), and a host
     * that skipped one got a subtree that laid out but never loaded its font, or
     * one whose theme tokens resolved against an empty map. There is no useful
     * state in between them, so there is no reason to be able to express one.
     *
     * Safe — and cheap — to call every frame. An unchanged catalog and an
     * unchanged context map each short-circuit, and {@link resolveContext} fires
     * on a node's **first** attach only: re-firing it would clobber an in-flight
     * tween's value once per frame.
     *
     * @internal Driven by `Scene`/`LayerStack` once per frame, and by
     * {@link add} for a subtree that joins mid-frame.
     */
    attach(scope: AttachScope): void {
        const first = !this._mounted;
        this._mounted = true;

        if (this._assets !== scope.assets) this._assets = scope.assets;

        const next = this.provideContext(scope.context);
        // Unchanged map, already bound, and not this instance's first attach ⇒
        // the whole subtree already holds `next` and the walk below would be pure
        // repetition of the context half. The time half still has to run.
        const contextChanged = !this._contextBound || this._context !== next;
        if (contextChanged) {
            this._context = next;
            this._contextBound = true;
        }
        if (first) this.resolveContext(next);

        this.advanceOwnTime(scope.time);

        if (this._children.length === 0) return;
        const childScope = next === scope.context ? scope : { ...scope, context: next };
        for (const child of this._children) child.attach(childScope);
    }

    /**
     * Take this subtree out of the scene. Everything gated on
     * {@link mounted} — measure, layout, render, asset declaration, commands —
     * stops for it and its descendants.
     *
     * Not a teardown: the node keeps its props, its children and its bindings,
     * so a detached subtree can be attached somewhere else (that is what
     * `reparent` is). {@link dispose} is the teardown.
     *
     * @internal Driven by {@link remove}/{@link clear}.
     */
    detach(): void {
        if (!this._mounted) return;
        this._mounted = false;
        for (const child of this._children) child.detach();
    }

    /** The scope this node was last attached with, for handing to a late child. */
    private currentScope(): AttachScope | null {
        return this._assets && this._contextBound
            ? { assets: this._assets, context: this._context, time: this._time.total }
            : null;
    }

    /** Attach `child` if this node is itself attached; otherwise leave it for the walk. */
    /** @internal Shared with `Node2D.addChildAt`, which splices rather than pushes. */
    protected attachChild(child: Node): void {
        if (!this._mounted) return;
        const scope = this.currentScope();
        if (scope) child.attach(scope);
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
     * "each pass" re-entry to guard against — never call {@link clear} or
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
    protected resolveContext(ctx: ContextMap): void { }

    /**
     * Providers override this to attach their token(s) to the {@link ContextMap}
     * handed to descendants. Base passes the parent's map through unchanged.
     */
    protected provideContext(parent: ContextMap): ContextMap {
        return parent;
    }

    /**
     * Adopt a **detached** node for binding only — its asset catalog, inherited
     * context and clock — without making it a child.
     *
     * Tree membership supplies three things a node cannot work without: the asset
     * catalog (a webfont never shapes and an `<Image>` never loads without it),
     * the resolved context map (theme tokens), and a ticking clock. Layout and
     * painting are *not* among them. So a node used purely as a source of pixels —
     * a `Tex.surface(...)` subtree rasterized onto 3D geometry — can be attached by
     * whatever consumes it and laid out on demand, instead of having to sit in a
     * particular place in the tree.
     *
     * Safe to call every frame: {@link attach} short-circuits on an unchanged
     * catalog and context, fires `resolveContext` only on the adoptee's first
     * attach, and is idempotent for a repeated time.
     */
    protected attachDetached(node: Node): void {
        const scope = this.currentScope();
        if (scope) node.attach(scope);
    }

    /**
     * Declare every asset **layout** depends on — fonts, and any opaque async
     * load that measurement needs (e.g. {@link Code}'s syntax grammar).
     *
     * Runs ahead of {@link layout}, so the node cannot read its `layoutBounds`
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
    prepareLayout(tracker: AssetTracker): void {

    }

    /**
     * Declare every asset **render** needs — images, video, 3D resources, effect
     * textures, and the audio a playing clip schedules.
     *
     * Runs after {@link layout}, so `layoutBounds` is live and a declaration can be
     * sized to what will actually be painted (which is how the decode resolution
     * is chosen). See {@link prepareLayout} for the rest of the contract.
     *
     * The base implementation declares this node's `effects`; {@link ShapeNode}
     * extends it with `fill`/`overlay`/`stroke`/`shadow`, so most nodes never
     * override this at all — only one that paints something its attributes don't
     * describe (a raw `Graphics2D` built from a literal src) has anything to add.
     *
     * ```ts
     * override prepareRender(tracker: AssetTracker): void {
     *     super.prepareRender(tracker);
     *     tracker.addImage("./images/1.png", { width: 100, height: 100 });
     * }
     * ```
     */
    prepareRender(tracker: AssetTracker): void { }

    // ---- Child management -------------------------------------------------

    get children(): Node[] {
        return this._children;
    }

    /**
     * Every child in **document order, both dimensions** — what {@link children}
     * returns here, and what it filters on a {@link Node2D}.
     *
     * The one place the distinction bites is a `Canvas3D`, whose list is mixed:
     * its `Node3D` children describe the scene it paints and its `Node2D`
     * children are a HUD over it, and `Node2D.children` drops the former. That is
     * right for layout — a mesh has no box to arrange — and wrong for anything
     * keyed on a child's **index**, because dropping the meshes renumbers the
     * HUD. A host that built its own path map over the authored tree would then
     * put the selection box round the wrong node.
     *
     * So the picking walk reads this instead (see `runtime/node-picking.ts`), and
     * every other reader keeps the filtered list it asked for.
     */
    /** @internal */
    get _allChildren(): readonly Node[] {
        return this._children;
    }

    /**
     * Add children — a single node, an array, or an arbitrarily-nested one, JSX
     * included.
     *
     * The one way in. It works the same before the node is linked into the tree
     * (in a constructor) as after, so a composite builds its structure from
     * *props* right in its constructor — no `init`-style hook, no idempotency
     * guard, since a constructor runs once.
     *
     * Accepts the same shape as the `children` prop: nested arrays are flattened
     * (`.flat(Infinity)`) and non-`Node` entries (`false`/`null`/`undefined`
     * from `cond && <Node/>`) are dropped, so `this.add(items.map(...))` and
     * `this.add(cond && <Text/>)` both work directly.
     *
     * A child of the other dimension throws — see {@link acceptsChild}.
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
        const flat = Node.flattenChildrenProp({ children: child });
        if (flat.length > 0) this.addChildren(flat);
    }

    /**
     * Remove children — the same shapes {@link add} accepts.
     *
     * A node that is not a child of this one is ignored, so removing twice is
     * harmless. Each one removed is detached, which unmounts its whole subtree:
     * it stops being measured, laid out, drawn and declared, and its commands go
     * inert until it is added somewhere again.
     */
    remove(child: NodeChildren): void {
        if (child instanceof Node) {
            this.removeChild(child);
            return;
        }
        for (const node of Node.flattenChildrenProp({ children: child })) {
            this.removeChild(node);
        }
    }

    /** Remove every child, detaching each (see {@link remove}). */
    clear(): void {
        for (const child of this._children) {
            child._parent = null;
            child.detach();
        }
        this._children.length = 0;
    }

    // ---- Insertion / removal internals ------------------------------------
    // `add`/`remove`/`clear` are the surface; these are how they do it. Private
    // rather than protected: `add` already covers everything they do and more
    // (it flattens, it filters), so a subclass reaching past it would only be
    // opting out of that.

    private addChild(child: Node): void {
        this.assertAcceptsChild(child);
        this._children.push(child);
        child._parent = this;
        // Attached on insertion, not on the next walk: a child added mid-frame
        // has to be mounted before the layout and render passes reach it, or the
        // mount guards would skip the very node the generator just created.
        this.attachChild(child);
    }

    private addChildren(children: Node[]): void {
        for (const child of children) this.assertAcceptsChild(child);
        this._children.push(...children);
        for (const child of children) child._parent = this;
        for (const child of children) this.attachChild(child);
    }

    private removeChild(child: Node): void {
        const i = this._children.indexOf(child);
        if (i < 0) return;
        const [removed] = this._children.splice(i, 1);
        if (removed) {
            removed._parent = null;
            removed.detach();
        }
    }

    // ---- Teardown ---------------------------------------------------------

    dispose(): void {
        // No per-node loader disposers to run: an async load is declared through
        // `tracker.addAsync`, so its `Disposer` belongs to the `LoaderRecord` on
        // the timeline and `AssetManager` runs it when the frame window closes.
        if (this.__cells) {
            for (const cell of this.__cells.signals.values()) {
                cell.dispose();
            }
        }
        this.__cells = undefined;
        this._assets = null;
        this._mounted = false;
        // Drop inherited context so a reused instance re-derives it from the next
        // attach rather than serving a stale map. `_props` is authored identity
        // and is deliberately retained so provideContext still works after reuse.
        this._context = ContextMap.EMPTY;
        this._contextBound = false;
    }
}
