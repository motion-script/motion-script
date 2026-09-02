import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Measurer2D } from "@/render/measurer";
import { RenderPass2D } from "@/render/render-context2d";
import { Canvas2D } from "./canvas2d-node";
import { NodeTime } from "@/nodes/node/node-time";
import { type AttachScope } from "@/nodes/node/node";
import type { Stage } from "./stage";
import { declareLayoutAssets, declareRenderAssets, primeMotionTree, sampleTree } from "@/nodes/node/node-walk";

export type { Stage } from "./stage";

/**
 * A self-contained unit of a project's timeline.
 *
 * A scene is **not a node** and is **not composed**. It owns a {@link Canvas2D}
 * — a viewport-sized world container that doubles as the scene's camera — and a
 * {@link SceneDriver} that builds into it and can say what it looks like at any
 * time.
 *
 * Authored from a document. `createStillScene` and `createAnimationScene`
 * (`document/scene.ts`) are the two ways to make one:
 *
 *   createAnimationScene({
 *     kind: "animation",
 *     commands: [
 *       { id: "a", type: "add", target: null, at: 0, params: { node: … } },
 *       { id: "b", type: "to", target: "card", at: 0, duration: 1,
 *         params: { props: { x: 200 } } },
 *     ],
 *   });
 *
 * The runtime drives a scene through `reset → attach → build →
 * prepareLayoutAssets → layout → prepareRenderAssets → render → dispose`, each
 * forwarding to the canvas. The two declaration phases are ordered around
 * `layout` because that is what separates them: fonts and anything else
 * measurement depends on have to be named before it, and anything sized against
 * a `layoutBounds` after it. See `Node.prepareLayout`.
 *
 * **Authoring goes through the {@link Stage}, not through here.** `add`, `set`
 * and the sound helpers are the *stage's* surface; what remains on `Scene` is
 * the runtime lifecycle and the scene's identity. A host holding a `Scene` is
 * driving it, not writing it.
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

    /** What builds the tree and evaluates it at a time. */
    private readonly _driver: SceneDriver;

    /** Human-readable name for the timeline and for errors. */
    name: string = "Scene";

    /**
     * Identity of this scene's *content*, for a host's `PrecompCache`.
     *
     * A host that sets this should derive it from everything the pass depends on
     * — the document, the viewport, and the fps — so that equal keys really do
     * imply equal passes and the store needs no separate validity check. A scene
     * without one simply measures every time, which is correct rather than merely
     * safe: a wrong key would serve one scene's timings for another.
     *
     * Because it travels on the scene instance, a pass that completes after the
     * host has moved on is still recorded against the build it actually measured.
     */
    precompKey?: string;

    /** Sounds created via startSound() — auto-ticked and auto-prepared. */
    private _managedSounds: Sound[] = [];

    /** Full viewport this scene renders against (set by the playback engine). */
    private _viewport: Size2D | null = null;

    constructor(driver: SceneDriver) {
        this._driver = driver;
        this._canvas = this.buildCanvas();
    }

    /**
     * A fresh world container at this scene's current viewport.
     *
     * The canvas keeps the historical scene defaults: it fills the viewport and
     * stacks its children, and a document's `root` props override those. It is a
     * {@link Canvas2D}, so the scene drives the camera (zoom/origin/heading) from
     * the same node.
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

    /** The asset catalog bound to the scene. */
    get assets(): AssetCatalog {
        return this.canvas.assets;
    }

    // ─── Audio ────────────────────────────────────────────────────────────────

    /**
     * Start a sound on the scene's audio timeline and return the {@link Sound}
     * handle. Pair with {@link stopSound} to end playback.
     *
     * @internal Reached from a `play` command.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // Intentionally do NOT resolve `trimEnd` to the scene's media length here. A
        // sound started and never stopped stays unbounded so it can continue across
        // scene boundaries: `Sound.prepare` emits it as an OPEN request whose end is
        // resolved against the project total in `assembleTimeline`. (An explicit
        // `stopSound`, or a finite trim/duration, still bounds it.)
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

    // ─── Build ────────────────────────────────────────────────────────────────

    /**
     * Build this scene's node tree into `stage`.
     *
     * Called by `CanvasStage.build`, which binds itself to this scene first —
     * binding and building are one call there so a stage can never be forwarding
     * a driver's `add`/`set` to a different scene's canvas.
     *
     * @internal
     */
    build(stage: Stage): void {
        this._driver.build(stage);
    }

    /**
     * Fix the scene's commands against a laid-out tree.
     *
     * Called once per build pass, after {@link build} and the layout that
     * follows it. See {@link SceneDriver.compile}.
     *
     * @internal
     */
    compile(): void {
        this._driver.compile?.();
    }

    /**
     * Put the scene into the state for `seconds`.
     *
     * A pure function of `seconds`: called in any order, repeatedly, and with
     * time going backwards. There is no replay path behind it — no reset on a
     * backward seek, no time-slicing, no cancellation, because there is nothing
     * long-running to interrupt.
     */
    evaluateAt(seconds: number): void {
        this._driver.evaluateAt(seconds);
    }

    /** How long the scene runs, as its driver declares it. */
    get duration(): number {
        return this._driver.duration;
    }

    // ─── Runtime lifecycle (forwarders to the canvas) ─────────────────────────

    /**
     * Tear the scene down to the state a fresh build starts from: a brand-new
     * canvas, no children, no sounds, a clock at zero.
     *
     * **The canvas is rebuilt, not rewound.** A scene instance is owned by the
     * project config and reused across playback controllers and across passes.
     * Restoring props in place meant enumerating what "restore" covered (prop
     * defaults, but not the save stack, not the clock, not a stale binding), and
     * anything the list missed leaked into the next pass as a tween whose `from`
     * already equalled its target — an animation that silently did nothing.
     * Constructing a new node has no list to keep current.
     *
     * Off the hot path now that a scene is evaluated rather than replayed: a seek
     * re-evaluates the tree it already built instead of rebuilding it.
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
     * Managed sounds ({@link startSound}) are the scene's own rather than any
     * node's, so they are declared here rather than reached by the tree walk.
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
     * `layoutBounds` currently holds. The analysis pass keeps the two calls
     * separate, either side of `layout`, precisely to avoid that.
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
 * A host's own way of building a scene and putting it into the state for a time.
 *
 * The seam a scene is authored through. Core deliberately learns nothing about
 * *what* the host's data is: there are no rows here, no notion of a command
 * list, nothing to serialize. All this says is that something can build a tree,
 * and something can put that tree into the state for a time. The concrete
 * document model that implements it lives in `document/`.
 *
 * @see createDrivenScene
 */
export interface SceneDriver {
    /**
     * Build the node tree, through the {@link Stage}.
     *
     * Runs on every build pass and must build fresh nodes each time:
     * {@link Scene.reset} disposes and clears the canvas's children between
     * passes, so a node captured outside this call is torn down before its
     * second use.
     */
    build(stage: Stage): void;
    /**
     * Fix each command's start value, with the tree **laid out**.
     *
     * Split from {@link build} because some commands read post-layout state to
     * decide what they animate *from*: an animated `removeChildAt` pins the
     * departing child to its rendered `measuredWidth`, and a hug/fill
     * `addChildAt` measures against the parent's retained constraints. Those are
     * zero until a layout pass has run, so compiling inside `build` would pin
     * every one of them to nothing — a shrink from 0 to 0, which reads as the
     * child vanishing instantly.
     *
     * The runtime therefore builds, lays out, then compiles. Optional: a driver
     * whose commands read nothing but props can do all its work in `build`.
     */
    compile?(): void;
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
 * Create a scene from a {@link SceneDriver}.
 *
 * The low-level constructor. Prefer `createStillScene` / `createAnimationScene`
 * (`document/scene.ts`), which build the driver from a document; reach for this
 * when the host has a timeline model of its own.
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
    return new Scene(driver);
}
