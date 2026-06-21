import { Node, NodeClock } from "./node";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage, SceneContext } from "@/render/build-stage";
import { Rect, RectProps } from "../geometry/rect-node";
import { Fill } from "@/attributes/shape/fill/chain";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import { RenderContext } from "@/render/render-context";

/**
 * The context a scene generator is given. It is the {@link BuildStage} (canvas
 * `viewport`, `fps`, seeded `random`/`noise`) augmented with the scene-authoring
 * surface, all typed precisely:
 *
 *   export default createScene(function* (stage) {
 *     stage.set({ fill: 'bg' });
 *     stage.add(<Rect … />);
 *     yield* stage.playSound('x.mp3');
 *   });
 *
 * At runtime this is a single `BuildStage` instance with the current scene bound
 * onto it; the precise method signatures here override the structural ones the
 * stage declares so authors get real types.
 */
export type SceneStage = Omit<BuildStage, 'add' | 'set' | 'startSound' | 'stopSound' | 'playSound' | 'clock' | 'assets'> & {
    /** Add a node (or array of nodes) to the scene's root container. */
    add(node: Node | Node[]): void;
    /** Set one or more reactive props on the scene's root container. */
    set(props: { [K in keyof RectProps]?: RectProps[K] | (() => RectProps[K]) }): void;
    /** Start a non-blocking sound on the scene's audio timeline. */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound;
    /** Stop a sound started via {@link startSound}. */
    stopSound(sound: Sound): void;
    /** Play a sound, blocking the generator for the clip's duration. */
    playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator;
    /** The scene's clock (scene-relative time). */
    readonly clock: Readonly<NodeClock>;
    /** The asset catalog bound to the scene. */
    readonly assets: AssetCatalog;
};

/** A scene's body: a generator factory given the {@link SceneStage}. */
export type SceneGenerator = (stage: SceneStage) => FrameGenerator;

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
 * layout → render → prepareAssets → dispose`, each forwarding to the root.
 * The scene also implements {@link SceneContext} so a {@link BuildStage} can
 * bind it and route `add`/`set`/sounds back here.
 */
export class Scene implements SceneContext {

    /** The world container this scene builds into. Viewport-sized, top-level. */
    readonly root: Rect;

    /** The generator body supplied to {@link createScene}. */
    private readonly generator: SceneGenerator;

    /**
     * Stable identity of the scene's source module, stamped by the `?scene` Vite
     * transform (the scene file's path relative to the project root). Used to
     * route a hot update back to the right timeline slot. `undefined` outside the
     * dev-server `?scene` pipeline.
     */
    __sceneHotId?: string;

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
        this.root = new Rect({ width: 'fill', height: 'fill', group: 'stack' });
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

    // ─── Authoring surface (SceneContext — bound onto the BuildStage) ─────────

    /** Add a node (or array of nodes) as a child of the scene's root. */
    add(node: Node | Node[]): void {
        if (Array.isArray(node)) {
            this.root.addChildren(node);
        } else {
            this.root.addChild(node);
        }
    }

    /** Set one or more reactive props on the root container. */
    set(props: { [K in keyof RectProps]?: RectProps[K] | (() => RectProps[K]) }): void {
        this.root.set(props);
    }

    /** The root's fill. */
    get fill(): Fill { return this.root.fill; }
    set fill(value: Fill) { this.root.fill = value; }

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
     * Produce this scene's frame generator. Binds this scene onto the stage (so
     * `stage.add`/`set`/sounds forward here), then runs the authored generator.
     */
    build(stage: BuildStage): FrameGenerator {
        stage.bindScene(this);
        return this.generator(stage as unknown as SceneStage);
    }

    // ─── Runtime lifecycle (forwarders to the root) ───────────────────────────

    /** Clear all dynamically-added children and managed sounds, and reset the clock. */
    reset(): void {
        // A scene instance is owned by the project config and reused across
        // playback controllers (StrictMode double-mount, HMR). A prior
        // controller's dispose() frees the root's signals; restore them from
        // defaults before rebuilding so reads like `this.fill` stay valid.
        this.root.reinit();
        for (const child of this.root.children) child.dispose();
        this.root.clearChildren();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }

    /** Bind the asset catalog to the scene's whole node subtree. */
    bindAssets(context: AssetCatalog): void {
        this.root.bindAssets(context);
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
    layout(rect: BoxBounds, scope: MeasureScope): void {
        this.root.layout(rect, scope);
    }

    /** Render the scene's world into `context`. */
    render(context: RenderContext): void {
        this.root.render(context);
    }

    /** Collect this scene's asset requests (nodes + managed sounds). */
    prepareAssets(tracker: AssetTracker): void {
        this.root.prepareAssets(tracker);
        for (const s of this._managedSounds) s.prepare(tracker);
    }

    dispose(): void {
        this.root.dispose();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }
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
