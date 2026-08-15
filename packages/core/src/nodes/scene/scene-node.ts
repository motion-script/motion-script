import { AnimationBuilder } from "@/tween/animation-builder";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { Fill } from "@/attributes/shape/fill/chain";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Vector2 } from "@/attributes/layout/vector2";
import { FlowMode } from "@/layout/flow-engine";
import { GapSize } from "@/layout/flex";
import { Anchor } from "@/attributes/layout/anchor";
import { Insets } from "@/attributes/layout/insets";
import { EasingFunction } from "@/tween/ease/type";
import { TweenOptions } from "@/tween/lerp";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Measurer } from "@/render/measurer";
import { RenderContext } from "@/render/render-context";
import { RootNode, RootProps } from "./root-node";
import { NodeClock } from "../base/node-clock";
import { Node } from "../base/node";

/**
 * The object a scene generator is handed. It merges the build-time determinism
 * surface ({@link BuildStage}: `viewport`, `fps`, and `random(seed)` → a seeded
 * `Random` source) with the {@link Scene}'s own authoring surface (`add`, `set`, sounds,
 * and the root commands `to`/`fillTo`/`zoomTo`/… plus `root`):
 *
 *   export default createScene(function* (stage) {
 *     stage.set({ fill: 'bg' });
 *     stage.add(<Rect … />);
 *     yield* stage.zoomTo(2, 1);
 *   });
 *
 * No re-declaration: the authoring methods are the real {@link Scene} members
 * and the determinism methods are the real {@link BuildStage} members. At
 * runtime the generator is given one object that is both (see {@link Scene.build}).
 *
 * `Pick<T, keyof T>` strips each class down to its **public** surface — `keyof`
 * omits `private`/`protected` members, which TS treats nominally and which would
 * otherwise make `Stage` satisfiable only by a real subclass instance rather
 * than the merged view the generator actually receives.
 */
export type Stage =
    & Pick<BuildStage<Scene>, keyof BuildStage<Scene>>
    & Pick<Scene, keyof Scene>;

/** A scene's body: a generator factory given the {@link Stage}. */
export type SceneGenerator = (stage: Stage) => FrameGenerator;

/**
 * A self-contained unit of a project's timeline.
 *
 * A scene is **not a node** and is **not composed**. It owns a root {@link Rect}
 * (a viewport-sized world container) and a generator that builds into it. This
 * is what makes scene-level hot reloading work: each scene file is its own HMR
 * boundary (`import scene from './scene?scene'`), and a scene can be swapped in
 * place without rebuilding the rest of the timeline.
 *
 * Authored with {@link createScene} — you never construct one directly:
 *
 *   // scenes/intro.tsx
 *   export default createScene(function* (stage) {
 *     stage.set({ fill: 'bg' });
 *     stage.add(<Rect … />);
 *     yield* …;
 *   });
 *
 * The runtime drives a scene through `reset → bindAssets → ellapse → build →
 * prepareLayoutAssets → layout → prepareRenderAssets → render → dispose`, each
 * forwarding to the root. The two declaration phases are ordered around `layout`
 * because that is what separates them: fonts and anything else measurement
 * depends on have to be named before it, and anything sized against a
 * `layoutRect` after it. See {@link Node.prepareLayout}.
 *
 * The scene's authoring methods (`add`/`set`/`to`/camera/paint/sounds) all act
 * on its {@link RootNode} `root`. They're merged with a {@link BuildStage} into
 * the {@link Stage} a generator receives — see {@link Scene.build}.
 */
export class Scene {

    /** The world container this scene builds into. Viewport-sized, top-level.
     *  A {@link RootNode}: a layouting Rect that also acts as the scene camera. */
    readonly root: RootNode;

    /** The generator body supplied to {@link createScene}. */
    private readonly generator: SceneGenerator;

    /**
     * Stable identity of the scene's source module, stamped by the `?scene` Vite
     * transform (the scene file's path relative to the project root). Used to
     * route a hot update back to the right timeline slot. `undefined` outside the
     * dev-server `?scene` pipeline.
     */
    __sceneHotId?: string;

    /**
     * Identity of this scene's *content*, for a {@link PrecompCache}.
     *
     * Distinct from {@link __sceneHotId}, which identifies the timeline **slot**
     * a scene belongs to and therefore stays the same across an edit — that is
     * exactly what hot replacement needs, and exactly what a measurement cache
     * must not key on, since it would serve the pre-edit frame count forever.
     *
     * A host that sets this should derive it from everything the pass depends on
     * — the scene's own content, the viewport, and the fps — so that equal keys
     * really do imply equal passes. Because it travels on the scene instance, a
     * pass that completes after the host has moved on is still recorded against
     * the build it actually measured, rather than whatever is current when it
     * lands.
     *
     * Falls back to {@link __sceneHotId} when unset (see `storeKeyOf`), which is
     * the right key for the Vite plugin's store — it validates entries by
     * re-hashing each one's recorded source dependencies instead.
     */
    __precompKey?: string;

    /** Human-readable name for the timeline/errors. Defaults to "Scene"; the
     *  `?scene` transform overrides it with the file's basename. */
    name: string = "Scene";

    /** Sounds created via startSound() / playSound() — auto-ticked and auto-prepared. */
    private _managedSounds: Sound[] = [];

    /** Full viewport this scene renders against (set by the playback engine). */
    private _viewport: Size2D | null = null;

    constructor(generator: SceneGenerator) {
        this.generator = generator;
        // The root keeps the historical scene defaults: it fills the viewport and
        // stacks its children. A scene generator overrides these with set(...).
        // It's a RootNode, so the scene can also drive the camera (zoom/origin/
        // heading) from the same root via set(...) or root.zoomTo(...).
        this.root = new RootNode({ width: 'fill', height: 'fill', flow: 'freeform' });
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    /** The full viewport this scene renders its world against. */
    get viewportSize(): Size2D | null {
        return this._viewport;
    }

    /** Record the full viewport (called by the playback engine). */
    setViewport(size: Size2D): void {
        this._viewport = { width: size.width, height: size.height };
    }

    // ─── Authoring surface (the methods merged onto the Stage) ──────────────────
    // These all act on the scene's `root` ({@link RootNode}). They're exposed
    // here so a generator can author the whole root through `stage` directly —
    // `stage.add(...)`, `stage.set({ fill, zoom })`, `stage.zoomTo(...)` — without
    // reaching for `stage.root`. For anything not forwarded, `stage.root` is the
    // full node.

    /** Add a node (or array of nodes) as a child of the scene's root. */
    add(node: Node | Node[]): void {
        if (Array.isArray(node)) {
            this.root.addChildren(node);
        } else {
            this.root.addChild(node);
        }
    }

    /** Set one or more reactive props on the root container. */
    set(props: { [K in keyof RootProps]?: RootProps[K] | (() => RootProps[K]) }): void {
        this.root.set(props);
    }

    /** Animate any root props in one call — `yield* stage.to({ zoom: 2, fill: 'red' }, 1)`. */
    to(props: Partial<RootProps>, duration: number, easing?: EasingFunction): AnimationBuilder<RootProps> {
        return this.root.to(props, duration, easing);
    }

    // ── Camera commands (forward to the root) ──

    /** Animate the camera magnification (`zoom`). > 1 zooms in; < 1 zooms out. */
    zoomTo(zoom: number, duration: number, ease?: EasingFunction): AnimationBuilder<RootProps> {
        return this.root.zoomTo(zoom, duration, ease);
    }

    /** Animate the camera focus point (`lookAt`) — the world point at viewport centre. */
    panTo(lookAt: Vector2, duration: number, ease?: EasingFunction): AnimationBuilder<RootProps> {
        return this.root.panTo(lookAt, duration, ease);
    }

    /** Animate the camera view rotation (`heading`) in degrees. */
    headingTo(heading: number, duration: number, ease?: EasingFunction): AnimationBuilder<RootProps> {
        return this.root.headingTo(heading, duration, ease);
    }

    // ── Paint commands (forward to the root) ──

    /** Animate the root `fill` (the scene-wide background). */
    fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        return this.root.fillTo(to, duration, options);
    }

    /** Animate the root `overlay` (painted over fill + children, viewport-wide). */
    overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        return this.root.overlayTo(to, duration, options);
    }

    /** The root's background fill. */
    get fill(): Fill { return this.root.fill; }
    set fill(value: Fill) { this.root.fill = value; }

    /** The root's overlay. */
    get overlay(): Fill { return this.root.overlay; }
    set overlay(value: Fill) { this.root.overlay = value; }

    // ── Layout container (forward to the root) ──

    /** The root's layout mode for children: `horizontal` / `vertical` / `freeform`. */
    get flow(): FlowMode { return this.root.flow; }
    set flow(value: FlowMode) { this.root.flow = value; }

    /** Spacing between the root's children along the layout's main axis. Set via `stage.set({ gap })`. */
    get gap(): GapSize { return this.root.gap; }

    /** Alignment of the root's children within the viewport. */
    get align(): Anchor { return this.root.align; }
    set align(value: Anchor) { this.root.align = value; }

    /** Inner spacing between the viewport edges and the root's children. */
    get padding(): Insets { return this.root.padding; }
    set padding(value: Insets) { this.root.padding = value; }

    // ── Camera (forward to the root) ──

    /** Camera magnification factor. > 1 zooms in; < 1 zooms out. */
    get zoom(): number { return this.root.zoom; }
    set zoom(value: number) { this.root.zoom = value; }

    /** World-space point that maps to the centre of the viewport. */
    get origin(): Vector2 { return this.root.lookAt; }
    set origin(value: Vector2) { this.root.lookAt = value; }

    /** Camera view rotation in degrees (clockwise). */
    get heading(): number { return this.root.heading; }
    set heading(value: number) { this.root.heading = value; }

    /** Internal timing state of the root (scene-relative clock). */
    get clock(): Readonly<NodeClock> {
        return this.root.clock;
    }

    /** The asset catalog bound to the scene (via {@link bindAssets}). */
    get assets(): AssetCatalog {
        return this.root.assets;
    }

    /**
     * Start a sound on the scene's audio timeline without blocking, and return
     * the {@link Sound} handle. Pair with {@link stopSound} to end playback.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // Intentionally do NOT resolve `trimEnd` to the scene's media length here. A
        // sound started and never stopped stays unbounded so it can continue across
        // scene boundaries: `Sound.prepare` emits it as an OPEN request whose end is
        // resolved against the project total in `assembleTimeline`. (An explicit
        // `stopSound`, a finite trim/duration, or `playSound` still bounds it.)
        s.tick(this.clock.time);
        if (this._managedSounds.indexOf(s) < 0) this._managedSounds.push(s);
        s.start();
        return s;
    }

    /** Stop a sound started via {@link startSound}. No-op if it isn't playing. */
    stopSound(sound: Sound): void {
        sound.tick(this.clock.time);
        sound.stop();
    }

    /**
     * Play a sound on the scene's audio timeline. Blocks for the clip's duration.
     * Use as `yield* stage.playSound(...)` inside a scene generator.
     */
    *playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        if (s.trimEnd === Infinity && !s.loop) {
            s.trimEnd = this.assets.getMediaDuration(s.src);
        }
        s.tick(this.clock.time);
        this._managedSounds.push(s);
        try {
            yield* s.play();
        } finally {
            const idx = this._managedSounds.indexOf(s);
            if (idx >= 0) this._managedSounds.splice(idx, 1);
        }
    }

    // ─── Build ────────────────────────────────────────────────────────────────

    /**
     * Produce this scene's frame generator. The generator is handed a single
     * {@link Stage} object that exposes both surfaces: this scene's authoring
     * methods (`add`/`set`/`to`/`zoomTo`/sounds/…) and the build stage's
     * determinism (`viewport`/`fps`/`random`/`noise`/`seed`).
     *
     * The merge is a view created with the scene as its prototype (so authoring
     * resolves to real `Scene` members) overlaid with the stage's own properties
     * and its methods bound to the stage (so determinism keeps the stage's
     * `this`). One view is built per build pass.
     */
    build(stage: BuildStage<Scene>): FrameGenerator {
        stage.bindScene(this);
        return this.generator(mergeStage(stage, this));
    }

    /** The host driver, when this scene is evaluated rather than replayed. */
    private _driver?: SceneDriver;

    /** @internal Set by {@link createDrivenScene}; nothing else should call it. */
    setDriver(driver: SceneDriver): void {
        this._driver = driver;
    }

    /**
     * Put the scene into the state for `seconds`, or return `false` when this
     * scene has no driver and must be replayed instead.
     *
     * The runtime asks this before falling back to stepping the generator, so a
     * driven scene never enters the replay path at all — no reset on a backward
     * seek, no time-slicing, no cancellation, because there is nothing
     * long-running to interrupt.
     */
    evaluateAt(seconds: number): boolean {
        if (!this._driver) return false;
        this._driver.evaluateAt(seconds);
        return true;
    }

    /** The driver's declared duration, or `null` for a generator scene. */
    get drivenDuration(): number | null {
        return this._driver ? this._driver.duration : null;
    }

    // ─── Runtime lifecycle (forwarders to the root) ───────────────────────────

    /** Clear all dynamically-added children and managed sounds, and reset the clock. */
    reset(): void {
        // A scene instance is owned by the project config and reused across
        // playback controllers (StrictMode double-mount, HMR) and across passes
        // (precomp measures duration by running the generator to completion, which
        // leaves the root at its end-state). Force a default restore — not just
        // the disposed-signal recovery — so the root's own animatable props
        // (padding/zoom/heading/fill/…) start each build from their defaults
        // rather than a prior pass's end value, which would make the generator's
        // tweens snapshot `from` === target and visibly do nothing.
        this.root.reinit(true);
        for (const child of this.root.children) child.dispose();
        this.root.clearChildren();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }

    /** Bind the asset catalog to the scene's whole node subtree. */
    bindAssets(context: AssetCatalog): void {
        this.root.bindAssets(context);
    }

    /**
     * Push inherited context (theme/data/seed/text-style and user tokens) down
     * the scene's whole subtree. `runInit` true at start-of-pass (also fires each
     * node's `init`); false for the per-frame structural re-push. Mirrors
     * {@link bindAssets}. See `Node.bindContext`.
     */
    bindContext(context: ContextMap, runInit: boolean): void {
        this.root.bindContext(context, runInit);
    }

    /** Advance the scene's clock and per-frame sampling for the whole subtree. */
    ellapse(totalTime: number): void {
        this.root.ellapse(totalTime);
        for (const s of this._managedSounds) s.tick(totalTime);
    }

    /** Seed per-frame derived state (motion) without a full ellapse. */
    sample(): void {
        this.root.sample();
    }

    /** Lay the scene's world out against the given (full-viewport) bounds. */
    layout(rect: BoxBounds, scope: Measurer): void {
        this.root.layout(rect, scope);
    }

    /** Render the scene's world into `context`. */
    render(context: RenderContext): void {
        this.root.render(context);
    }

    /**
     * Collect what the tree needs to be **laid out** — fonts, and any async load
     * measurement depends on. Call before {@link layout}; see
     * {@link Node.prepareLayout}.
     */
    prepareLayoutAssets(tracker: AssetTracker): void {
        this.root.prepareLayoutAssets(tracker);
    }

    /**
     * Collect what the tree needs to be **drawn** — images, video, 3D, effect
     * textures, and the audio its clips schedule. Call after {@link layout}, so
     * every declaration can be sized against a real `layoutRect`.
     *
     * Managed sounds ({@link startSound}/{@link playSound}) are the scene's own
     * rather than any node's, so they are declared here rather than reached by
     * the tree walk.
     */
    prepareRenderAssets(tracker: AssetTracker): void {
        this.root.prepareRenderAssets(tracker);
        for (const s of this._managedSounds) s.prepare(tracker);
    }

    /**
     * Declare everything the scene needs **in its current state**, both phases in
     * one call.
     *
     * The shortcut for a host that is not running a per-frame pass: put the tree
     * into the state for some time, call this, repeat at the next interesting
     * time, and the union is the scene's asset set. Because nothing here has to
     * draw or measure, that is O(the times you sample) rather than O(frames) —
     * and an asset-bearing value is always the endpoint of a tween, so sampling
     * the boundaries is enough.
     *
     * Note this runs layout's declarations *and* render's without a layout pass
     * between them, so a size-dependent declaration falls back to whatever
     * `layoutRect` currently holds. Precomp keeps the two calls separate, either
     * side of `layout`, precisely to avoid that.
     */
    prepareAssets(tracker: AssetTracker): void {
        this.prepareLayoutAssets(tracker);
        this.prepareRenderAssets(tracker);
    }

    dispose(): void {
        this.root.dispose();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }
}

/**
 * Build the single {@link Stage} object handed to a scene generator: a view
 * that exposes the {@link Scene}'s authoring surface and the {@link BuildStage}'s
 * determinism surface at once.
 *
 * A Proxy (rather than a copy) so each access routes to whichever object owns
 * the member and methods keep their own `this` — the scene's `add`/`set`/sounds
 * run with the scene as receiver (reaching `root`/`_managedSounds`), and the
 * stage's `random`/`noise`/`seed` run with the stage as receiver (reaching its
 * `seeder`). The scene wins on name clashes; nothing currently clashes.
 */
function mergeStage(stage: BuildStage<Scene>, scene: Scene): Stage {
    return new Proxy(scene, {
        get(target, prop, receiver) {
            if (prop in target) {
                const value = Reflect.get(target, prop, receiver);
                return typeof value === "function" ? value.bind(target) : value;
            }
            const value = Reflect.get(stage as object, prop, stage);
            return typeof value === "function" ? value.bind(stage) : value;
        },
        has(target, prop) {
            return prop in target || prop in (stage as object);
        },
    }) as unknown as Stage;
}

/**
 * Create a scene from a generator body. This is the only way to author a scene:
 *
 *   // scenes/intro.tsx
 *   import { createScene, Rect } from '@motion-script/core';
 *
 *   export default createScene(function* (stage) {
 *     stage.set({ fill: 'bg' });
 *     stage.add(<Rect width={200} height={200} fill="royalblue" />);
 *     yield* …;
 *   });
 *
 * For a **parameterized** scene, write a function that returns a generator and
 * call it per `?scene` file (one instance per file keeps the hot-reload boundary
 * intact):
 *
 *   // scenes/card.ts  (shared factory — not a ?scene file)
 *   export const card = (opts: { color: string }): SceneGenerator =>
 *     function* (stage) { stage.add(<Rect fill={opts.color} />); yield* …; };
 *
 *   // scenes/blue-card.tsx  (a ?scene file → one instance)
 *   export default createScene(card({ color: 'royalblue' }));
 */
export function createScene(generator: SceneGenerator): Scene {
    return new Scene(generator);
}

/**
 * A still's content: a factory that returns the tree to draw, authors the root
 * through the {@link Stage} it is given, or does both.
 *
 * A **factory**, never a node — see {@link createStill} for why that is a
 * correctness requirement rather than a style preference.
 */
export type StillContent = (stage: Stage) => Node | Node[] | void;

/**
 * Create a single-frame scene — a thumbnail, a poster frame, a still export.
 *
 *   createStill(() => <Rect width="fill" height="fill" fill="bg" />)
 *
 * Sugar over {@link createScene} with a generator body that never yields, which
 * is already exactly one frame: the priming `next()` reports done immediately,
 * but the precomp loop still processes frame 0 in full before it breaks, so the
 * scene measures `frameCount === 1`. Nothing about rendering it differs from an
 * animated scene — it is the same build → layout → render pass, so a still and
 * frame 0 of the equivalent animation are the same image.
 *
 * ### Why a factory, and not a node
 *
 * A scene body runs **more than once per rendered frame**: the precomp measures
 * the scene, then the evaluator replays it, and {@link Scene.reset} disposes and
 * clears the root's children between passes. A node captured in a closure is
 * therefore disposed before its second use, and re-adding it puts a torn-down
 * tree into layout — which surfaces as an undefined padding/size deep inside the
 * layout engine, not as anything that names the real cause.
 *
 * So the factory is what makes the still rebuildable, and it is enforced: passing
 * a node throws immediately rather than failing obscurely later. (It also fixes
 * the same theme-timing problem a project `GlobalLayer` has — a node built at
 * module scope resolves its tokens against whatever registry existed then.)
 *
 * Scene-level props go through the stage, and may be combined with a returned tree:
 *
 *   createStill(stage => {
 *     stage.set({ fill: 'bg' });
 *     return <Text text={title} fontSize={120} />;
 *   });
 */
export function createStill(content: StillContent): Scene {
    if (content instanceof Node || Array.isArray(content)) {
        throw new TypeError(
            "createStill() takes a factory, not a node — write createStill(() => <Rect/>). " +
            "A scene is built more than once per frame and its children are disposed between " +
            "passes, so a node captured outside the factory is torn down before its second use.",
        );
    }
    return createScene(function* (stage) {
        // A `() => Node` factory ignores the argument, so both shapes — "build me
        // a tree" and "author the stage" — go through this one call.
        const nodes = content(stage);
        if (nodes) stage.add(nodes);
    });
}

/**
 * A host's own way of putting a scene into the state for a time.
 *
 * The seam for a timeline that is **data** rather than a generator. A generator
 * scene can only be advanced, so reaching frame N means running frames 0..N-1
 * and reaching frame N-1 afterwards means starting over from zero. A host whose
 * timeline is a list of commands with times already knows what frame N looks
 * like; it should not have to replay to prove it.
 *
 * Core deliberately learns nothing about *what* that data is. There are no rows
 * here, no notion of a command list, nothing to serialize — the engine stays
 * unopinionated about the document, and the host keeps its own model. All this
 * says is: something can build a tree, and something can put that tree into the
 * state for a time.
 *
 * @see createDrivenScene
 */
export interface SceneDriver {
    /**
     * Build the node tree, through the same {@link Stage} a generator gets.
     *
     * Runs on every build pass, and — like a generator body — must build fresh
     * nodes each time: {@link Scene.reset} disposes and clears the root's
     * children between passes, so a node captured outside this call is torn down
     * before its second use.
     */
    build(stage: Stage): void;
    /**
     * Put every node into the state it holds at `seconds` from the scene's start.
     *
     * Must be a function of `seconds` alone: called in any order, repeatedly, and
     * with time going backwards. That is the whole point — a host that needs the
     * previous call to have happened has re-invented the generator.
     */
    evaluateAt(seconds: number): void;
    /** How long the scene runs. Read once per build, after {@link build}. */
    readonly duration: number;
}

/**
 * Create a scene a host drives itself, rather than one a generator advances.
 *
 * The body never yields — the same trick {@link createStill} uses — so there is
 * nothing to replay, and `Scene.evaluateAt` is what the runtime calls instead.
 * Everything below the driver is unchanged: the same nodes, signals, layout,
 * render pass, asset declarations and clock. Only *how the props get their
 * values for a frame* differs.
 *
 * ```ts
 * const scene = createDrivenScene({
 *     build: (stage) => stage.add(myHost.buildTree()),
 *     evaluateAt: (seconds) => myHost.writePropsAt(seconds),
 *     get duration() { return myHost.duration },
 * });
 * ```
 */
export function createDrivenScene(driver: SceneDriver): Scene {
    const scene = createScene(function* (stage) {
        driver.build(stage);
    });
    scene.setDriver(driver);
    return scene;
}
