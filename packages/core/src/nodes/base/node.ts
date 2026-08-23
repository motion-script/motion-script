import { Signal } from "@/signals/signal";
import { SignalHost, TweenFn } from "@/signals/host";
import { EasingFunction } from "@/tween/ease/type";
import { toChain, type ChainableCommand } from "@/tween/chain";
import { makeCommand, type Command, type CommandTarget } from "@/tween/command";
import { prepareNumericCellTween } from "@/tween/prepare";
import { TweenStepper } from "@/tween/stepper";
import { RefTarget } from "@/util/reference";
import { Context, ContextMap } from "@/util/context";
import { Random } from "@/util/random";
import { AssetCatalog } from "@/assets/catalog";
import { AssetTracker } from "@/assets/tracker";
import { getPropertyMeta, PropOptions } from "@/attributes/properties/decorator";
import { nodePath } from "@/project/tree";
import {
    applyProp,
    applySnapshotLayer,
    captureLayer,
    collectProperties,
    popState,
    reapplyDefaults,
    restoreAnimated,
    saveState,
} from "./node-reactive";
import type { PropLayer } from "./node-reactive";
import { advanceClock } from "./node-motion";
import type { NodeClock } from "./node-clock";
import type { PropInputs } from "@/attributes/properties/inputs";

export type { NodeClock } from "./node-clock";
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
 * them anywhere else throws — see {@link addChild}.
 *
 * **Reactive properties** — fields declared with `@property()` are backed by
 * `Signal`s. Reading them inside a reactive context (e.g. a render pass) creates
 * a subscription; writing them propagates the change automatically. Use
 * {@link set} to update props imperatively, or pass a callback `() => expr` to
 * bind a prop to a derived value.
 *
 * **Tweening** — `to(props, duration, ease?)` returns a {@link ChainableCommand}
 * that animates one or more props to target values over the given duration (in
 * seconds). It is both a {@link Command} (evaluable at a time via `at(t)`) and
 * iterable, so `yield* node.to(...)` works.
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
     * Fire the `ref`, adopt the `seed`, and apply every `@property()`-decorated
     * field, reading initial values from `props`.
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

    // ---- Change tracking ---------------------------------------------------
    //
    // **Nothing consumes this today.** The drawing memo that read it was removed;
    // every node now rebuilds its `Graphics2D` every frame. What remains is the
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
     * One of this node's cells went stale. Implements `SignalOwner`.
     *
     * O(1), and deliberately does not propagate: nothing above this node caches
     * anything derived from it. A parent's own `Graphics2D` is built from the
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

    protected _children: Node[] = [];

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

    /** @internal Hot-path prop write (mapper- and binding-aware). Public-but-underscored like `_prepareStep` so reactive companions in this directory can call it; not part of the authoring surface. */
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
        // signal (15+): set() runs in the per-frame hot path. Only keys backed by
        // a signal are written; unknown keys are ignored — which is also what
        // lets a subclass distribute its own sugar (2D's `size`, `transform3D`)
        // into real keys and then delegate here.
        for (const key in props) {
            const val = (props as any)[key];
            if (val !== undefined && signals.has(key)) this._writeProp(key, val);
        }
    }

    to(to: Partial<P>, duration: number, easing?: EasingFunction): ChainableCommand<P> {
        return toChain<P>(this, to, duration, easing);
    }

    /**
     * Build a {@link Command} — an animation this node can be *evaluated* at, not
     * only run through.
     *
     * The seam a named command is written against. `to()` covers "move these
     * props there"; this covers everything a node wants to choreograph itself,
     * where the values at time `t` are a function the node knows and nobody
     * outside could reconstruct from a prop list.
     *
     * ```ts
     * @command()
     * draw(duration = 1, easing?: EasingFunction): Command<ChartProps> {
     *     const from = this.progress;
     *     return this.animate((t) => ({ progress: lerpNumber(from, 1, t) }), duration, easing);
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
     */
    protected animate<Props = P>(
        at: (t: number) => Partial<Props>,
        duration: number = 1,
        easing?: EasingFunction,
    ): Command<Props> {
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
     * yield* node.moveTo(200, 0, 1);
     * yield* node.restore(1);   // animate back to where it was saved
     */
    save(): void {
        saveState(this);
    }

    /**
     * Capture every reactive prop's current value **or binding** as a layer the
     * caller owns, without touching the {@link save} stack.
     *
     * {@link save}/{@link restore} are a stack, for authoring: save here, animate
     * away, restore later. Being pop-based they are consumed by the first
     * restore, and they interleave with anything else on the node using them. A
     * host that has to reset the *same* baseline over and over — a driven scene
     * putting a node back to its start before evaluating a frame — needs a layer
     * of its own instead.
     *
     * Captured at the **cell**, so what a layer holds is the mapped, internal
     * value. That is the point of it, not an implementation detail: reading a
     * mapped prop through its getter and writing it back through {@link set} runs
     * the mapper a second time, and a mapper is under no obligation to tolerate
     * its own output. Some cannot — a resolved value may not carry what it was
     * resolved *from* (a compiled expression no longer has its source text), so a
     * getter round-trip through `set` is lossy where a cell round-trip is exact.
     */
    captureProps(): PropLayer {
        return captureLayer(this);
    }

    /**
     * Reapply a layer from {@link captureProps}: plain values are set, reactive
     * bindings are re-bound.
     *
     * Writes straight to the cells, so it runs no mappers — see the note there.
     * Re-binding a cell to the function it already holds is a no-op in the
     * signal, so restoring a bound prop every frame costs nothing and, crucially,
     * does not detach the rule the way writing its resolved number would.
     */
    applyProps(layer: PropLayer): void {
        applySnapshotLayer(this, layer);
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
    restore(duration?: number, easing?: EasingFunction): void | Command<Record<string, never>> {
        const layer = popState(this);
        if (duration === undefined || duration <= 0) {
            if (layer) applySnapshotLayer(this, layer);
            return;
        }
        return restoreAnimated(this, layer, duration, easing);
    }

    // ---- Clock ------------------------------------------------------------

    protected _clock: NodeClock = {
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

    /**
     * Sample this node's own derived render state for the current frame. Nothing
     * to derive in the general case; {@link Node2D} samples its motion here.
     */
    protected _sample(): void { }

    /**
     * Record the subtree's current positions as the motion history's previous
     * frame, stamped `at`, deriving no velocity — see {@link primeMotion}.
     *
     * The driven path calls this with the props evaluated one frame back, so the
     * `sample()` that follows measures against the timeline rather than against
     * wherever the playhead happened to be.
     */
    public primeMotion(at: number): void {
        for (const child of this._children) child.primeMotion(at);
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
    protected bindChildContext(child: Node): void {
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
     * describe (a raw `Graphics2D` built from a literal src) has anything to add.
     *
     * ```ts
     * override prepareRender(tracker: AssetTracker): void {
     *     super.prepareRender(tracker);
     *     tracker.addImage("./images/1.png", { width: 100, height: 100 });
     * }
     * ```
     */
    prepareRender(_tracker: AssetTracker): void { }

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
        this.assertAcceptsChild(child);
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
        for (const child of children) this.assertAcceptsChild(child);
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
