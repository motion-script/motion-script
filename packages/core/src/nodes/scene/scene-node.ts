import { FrameGenerator } from "@/tween/generator";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Measurer2D } from "@/render/measurer";
import { RenderPass2D } from "@/render/render-context2d";
import { Canvas2D } from "./canvas2d-node";
import { NodeTime } from "@/nodes/node/node-time";
import { Node2D } from "@/nodes/2d/node2d";
import { Node, type AttachScope } from "@/nodes/node/node";
import type { Stage } from "./stage";
import { declareLayoutAssets, declareRenderAssets, primeMotionTree, sampleTree } from "@/nodes/node/node-walk";

export type { Stage } from "./stage";

/** A scene's body: a generator factory given the {@link Stage}. */
export type SceneGenerator = (stage: Stage) => FrameGenerator;

/**
 * A self-contained unit of a project's timeline.
 *
 * A scene is **not a node** and is **not composed**. It owns a {@link Canvas2D}
 * — a viewport-sized world container that doubles as the scene's camera — and a
 * generator that builds into it. This is what makes scene-level hot reloading
 * work: each scene file is its own HMR boundary (`import scene from
 * './scene?scene'`), and a scene can be swapped in place without rebuilding the
 * rest of the timeline.
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
 * The runtime drives a scene through `reset → attach → build →
 * prepareLayoutAssets → layout → prepareRenderAssets → render → dispose`, each
 * forwarding to the canvas. The two declaration phases are ordered around
 * `layout` because that is what separates them: fonts and anything else
 * measurement depends on have to be named before it, and anything sized against
 * a `layoutBounds` after it. See `Node.prepareLayout`.
 *
 * **Authoring goes through the {@link Stage}, not through here.** `add`, `set`,
 * the camera and paint commands and the sound helpers are the *stage's* surface;
 * what remains on `Scene` is the runtime lifecycle and the scene's identity. A
 * host holding a `Scene` is driving it, not writing it.
 */
export class Scene {

    /**
     * The world container this scene builds into. Viewport-sized, top-level:
     * a layouting frame that also acts as the scene camera.
     *
     * **Replaced, not reset, on every {@link reset}** — so read it through this
     * getter rather than holding the instance across a pass boundary.
     */
    get canvas(): Canvas2D { return this._canvas; }
    private _canvas: Canvas2D;

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
     * Identity of this scene's *content*, for a `PrecompCache`.
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
        this._canvas = this.buildCanvas();
    }

    /**
     * A fresh world container at this scene's current viewport.
     *
     * The canvas keeps the historical scene defaults: it fills the viewport and
     * stacks its children, and a generator overrides those through
     * `stage.set(...)`. It is a {@link Canvas2D}, so the scene drives the camera
     * (zoom/lookAt/heading) from the same node.
     */
    private buildCanvas(): Canvas2D {
        const size = this._viewport;
        return new Canvas2D({
            width: size ? size.width : 'fill',
            height: size ? size.height : 'fill',
            flow: 'freeform',
        });
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    /** The full viewport this scene renders its world against. */
    get viewportSize(): Size2D | null {
        return this._viewport;
    }

    /**
     * Record the full viewport and size the live canvas to it (called by the
     * playback engine).
     *
     * Remembered rather than only applied, because {@link reset} builds a *new*
     * canvas and it has to come back at the right size — a separate
     * `canvas.set({ width, height })` at the call site would be silently dropped
     * by the next reset.
     */
    setViewport(size: Size2D): void {
        this._viewport = { width: size.width, height: size.height };
        this._canvas.set({ width: size.width, height: size.height });
    }

    /** The scene-relative clock — the canvas's. */
    get time(): NodeTime {
        return this.canvas.time;
    }

    /** The asset catalog bound to the scene (via {@link bindAssets}). */
    get assets(): AssetCatalog {
        return this.canvas.assets;
    }

    // ─── Audio (reached by scene authors through the Stage) ───────────────────

    /**
     * Start a sound on the scene's audio timeline without blocking, and return
     * the {@link Sound} handle. Pair with {@link stopSound} to end playback.
     *
     * @internal Authors call `stage.startSound`.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // Intentionally do NOT resolve `trimEnd` to the scene's media length here. A
        // sound started and never stopped stays unbounded so it can continue across
        // scene boundaries: `Sound.prepare` emits it as an OPEN request whose end is
        // resolved against the project total in `assembleTimeline`. (An explicit
        // `stopSound`, a finite trim/duration, or `playSound` still bounds it.)
        s.tick(this.time.total);
        if (this._managedSounds.indexOf(s) < 0) this._managedSounds.push(s);
        s.start();
        return s;
    }

    /** Stop a sound started via {@link startSound}. No-op if it isn't playing. @internal */
    stopSound(sound: Sound): void {
        sound.tick(this.time.total);
        sound.stop();
    }

    /**
     * Play a sound on the scene's audio timeline. Blocks for the clip's duration.
     * @internal Authors call `yield* stage.playSound(...)`.
     */
    *playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        if (s.trimEnd === Infinity && !s.loop) {
            s.trimEnd = this.assets.getMediaDuration(s.src);
        }
        s.tick(this.time.total);
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
     * Produce this scene's frame generator against `stage`.
     *
     * Called by `CanvasStage.build`, which binds itself to this scene first —
     * binding and building are one call there so a stage can never be forwarding
     * a generator's `add`/`set` to a different scene's canvas.
     *
     * @internal
     */
    build(stage: Stage): FrameGenerator {
        return this.generator(stage);
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

    // ─── Runtime lifecycle (forwarders to the canvas) ─────────────────────────

    /**
     * Tear the scene down to the state a fresh build starts from: a brand-new
     * canvas, no children, no sounds, a clock at zero.
     *
     * **The canvas is rebuilt, not rewound.** A scene instance is owned by the
     * project config and reused across playback controllers (StrictMode
     * double-mount, HMR) and across passes — precomp measures a scene's duration
     * by running its generator to completion, which leaves every canvas prop at
     * its tweened end value. Restoring those in place meant enumerating what
     * "restore" covered (prop defaults, but not the save stack, not the clock,
     * not a stale binding), and anything the list missed leaked into the next
     * pass as a tween whose `from` already equalled its target — an animation
     * that silently did nothing. Constructing a new node has no list to keep
     * current.
     */
    reset(): void {
        for (const child of this._canvas.children) child.dispose();
        this._canvas.dispose();
        this._canvas = this.buildCanvas();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }

    /**
     * Put the scene's whole subtree into the scene at `scope.time`: bind the
     * asset catalog and the inherited context, advance the clock, sample.
     *
     * One call per frame. See `Node.attach` for why the three used to be three
     * and are now one.
     */
    attach(scope: AttachScope): void {
        this.canvas.attach(scope);
        for (const s of this._managedSounds) s.tick(scope.time);
    }

    /** Seed per-frame derived state (motion) without a full ellapse. */
    sample(): void {
        sampleTree(this.canvas);
    }

    /**
     * Record the scene's current positions as the motion history's previous
     * frame, stamped `at`, deriving no velocity — see `primeMotionTree`.
     */
    primeMotion(at: number): void {
        primeMotionTree(this.canvas, at);
    }

    /** Lay the scene's world out against the given (full-viewport) bounds. */
    layout(bounds: BoxBounds, measurer: Measurer2D): void {
        this.canvas.layout(bounds, measurer);
    }

    /** Render the scene's world into `context`. */
    render(context: RenderPass2D): void {
        this.canvas.render(context);
    }

    /**
     * Collect what the tree needs to be **laid out** — fonts, and any async load
     * measurement depends on. Call before {@link layout}; see
     * `Node.prepareLayout`.
     */
    prepareLayoutAssets(tracker: AssetTracker): void {
        declareLayoutAssets(this.canvas, tracker);
    }

    /**
     * Collect what the tree needs to be **drawn** — images, video, 3D, effect
     * textures, and the audio its clips schedule. Call after {@link layout}, so
     * every declaration can be sized against a real `layoutBounds`.
     *
     * Managed sounds ({@link startSound}/{@link playSound}) are the scene's own
     * rather than any node's, so they are declared here rather than reached by
     * the tree walk.
     */
    prepareRenderAssets(tracker: AssetTracker): void {
        declareRenderAssets(this.canvas, tracker);
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
     * `layoutBounds` currently holds. Precomp keeps the two calls separate,
     * either side of `layout`, precisely to avoid that.
     */
    prepareAssets(tracker: AssetTracker): void {
        this.prepareLayoutAssets(tracker);
        this.prepareRenderAssets(tracker);
    }

    dispose(): void {
        this.canvas.dispose();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }
}

/**
 * Create a scene from a generator body. This is the only way to author a scene:
 *
 *   // scenes/intro.tsx
 *   import { createScene, Rect } from 'motion-script';
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
 * A still's content: a factory that returns the tree to draw, authors the canvas
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
 * clears the canvas's children between passes. A node captured in a closure is
 * therefore disposed before its second use, and re-adding it puts a torn-down
 * tree into layout — which surfaces as an undefined padding/size deep inside the
 * layout engine, not as anything that names the real cause.
 *
 * So the factory is what makes the still rebuildable, and it is enforced: passing
 * a node throws immediately rather than failing obscurely later. (It also fixes
 * the same theme-timing problem a project global layer has — a node built at
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
    if (content instanceof Node2D || Array.isArray(content)) {
        throw new TypeError(
            "createStill() takes a factory, not a node — write createStill(() => <Rect/>). " +
            "A scene is built more than once per frame and its children are disposed between " +
            "passes, so a node captured outside the factory is torn down before its second use.",
        );
    }
    return createScene(function* (stage) {
        // A `() => Node2D` factory ignores the argument, so both shapes — "build me
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
     * nodes each time: {@link Scene.reset} disposes and clears the canvas's
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
