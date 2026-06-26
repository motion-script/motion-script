import { Node, NodeClock } from "./node";
import { AnimationBuilder } from "@/tween/animation-builder";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { RootNode, RootProps } from "./root-node";
import { Fill } from "@/attributes/shape/fill/chain";
import { Stroke, StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { Shadow, ShadowResolved } from "@/attributes/shape/shadow/resolver";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Vector2 } from "@/attributes/layout/vector2";
import { EasingFunction } from "@/tween/ease/type";
import { TweenOptions } from "@/tween/lerp";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import { RenderContext } from "@/render/render-context";

/**
 * The object a scene generator is handed. It merges the build-time determinism
 * surface ({@link BuildStage}: `viewport`, `fps`, seeded `random`/`noise`,
 * `seed`) with the {@link Scene}'s own authoring surface (`add`, `set`, sounds,
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
 * forwarding to the root. Asset collection is split around layout: fonts are
 * gathered first (text measurement needs their metrics), then images/video/paint
 * after layout (those size their decodes against each node's `layoutRect`).
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
        this.root = new RootNode({ width: 'fill', height: 'fill', group: 'stack' });
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
    zoomTo(zoom: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return this.root.zoomTo(zoom, duration, ease);
    }

    /** Animate the camera focus point (`origin`) — the world point at viewport centre. */
    originTo(origin: Vector2, duration: number, ease?: EasingFunction): FrameGenerator {
        return this.root.originTo(origin, duration, ease);
    }

    /** Animate the camera view rotation (`heading`) in degrees. */
    headingTo(heading: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return this.root.headingTo(heading, duration, ease);
    }

    // ── Paint commands (forward to the root) ──

    /** Animate the root `fill`. */
    fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        return this.root.fillTo(to, duration, options);
    }

    /** Animate the root `stroke`. */
    strokeTo(to: Stroke, duration: number, options?: TweenOptions<StrokeResolved[]>): FrameGenerator {
        return this.root.strokeTo(to, duration, options);
    }

    /** Animate the root `shadow`. */
    shadowTo(to: Shadow, duration: number, options?: TweenOptions<ShadowResolved[]>): FrameGenerator {
        return this.root.shadowTo(to, duration, options);
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

    /**
     * Collect the scene's **pre-layout** asset requests (fonts). Called before
     * {@link layout} so text/code can be measured with real font metrics.
     */
    prepareLayoutAssets(tracker: AssetTracker): void {
        this.root.prepareLayoutAssets(tracker);
    }

    /**
     * Collect the scene's **pre-render** asset requests (images, video, paint,
     * and managed sounds). Called after {@link layout} so nodes can size their
     * decodes against their `layoutRect`. Managed sounds have no layout
     * dependency, so they're prepared here alongside the render-phase nodes.
     */
    prepareRenderAssets(tracker: AssetTracker): void {
        this.root.prepareRenderAssets(tracker);
        for (const s of this._managedSounds) s.prepare(tracker);
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
