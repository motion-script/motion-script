import { getVariable } from "@/project/variables";
import { Random } from "@/util/random";
import type { Size2D } from "@/attributes/layout/size";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { Anchor } from "@/attributes/layout/anchor";
import type { Insets } from "@/attributes/layout/insets";
import type { GapSize } from "@/layout/flex";
import type { FlowMode } from "@/layout/flow-engine";
import type { Fill } from "@/attributes/shape/fill/chain";
import type { FillResolved } from "@/attributes/shape/fill/union";
import type { EasingFunction } from "@/tween/ease/type";
import type { TweenOptions } from "@/tween/lerp";
import type { Command } from "@/tween/command";
import type { FrameGenerator } from "@/tween/generator";
import type { Sound, SoundProps } from "@/attributes/audio/sound";
import type { AssetCatalog } from "@/assets/catalog";
import type { NodeTime } from "@/nodes/node/node-time";
import type { Node } from "@/nodes/node/node";
import type { Canvas2D, Canvas2DProps } from "./canvas2d-node";
import type { Scene } from "./scene-node";
import type { Stage } from "./stage";

/**
 * The one {@link Stage} implementation — what the runtime hands a scene
 * generator.
 *
 * One instance is created per build pass and re-bound to each scene in turn
 * (see {@link build}), so the determinism cache is shared across a pass while
 * the authoring surface always points at whichever scene is currently running.
 *
 * The authoring members are thin forwarders onto the bound scene's
 * {@link Canvas2D}. That indirection is the point: the canvas is a node, with a
 * node's whole surface, and a scene author should reach it through a named,
 * deliberately small set of verbs rather than through everything a `Node2D`
 * happens to expose.
 */
export class CanvasStage implements Stage {
    /** Canvas dimensions in pixels. */
    readonly viewport: Size2D;

    /** Target frames-per-second of the composition. */
    readonly fps: number;

    /** The scene this stage is currently bound to (see {@link build}). */
    private _scene: Scene | null = null;

    constructor(viewport: Size2D, fps: number) {
        this.viewport = viewport;
        this.fps = fps;
    }

    // ─── Scene binding ────────────────────────────────────────────────────────

    /**
     * Bind `scene` and produce its frame generator.
     *
     * Binding and building are one call so they cannot drift: a stage whose
     * bound scene is not the one whose generator is running would forward every
     * `add`/`set` to the wrong canvas, silently.
     */
    build(scene: Scene): FrameGenerator {
        this._scene = scene;
        return scene.build(this);
    }

    /** Release the bound scene. The runtime does this between passes. @internal */
    unbind(): void {
        this._scene = null;
    }

    /** The bound scene. Throws outside a build, which is the only place a stage is live. */
    private get scene(): Scene {
        if (!this._scene) {
            throw new Error("Stage has no bound scene — authoring methods are only available inside a scene generator.");
        }
        return this._scene;
    }

    // ─── The composition ──────────────────────────────────────────────────────

    /** See {@link Stage.variables}. */
    variables<T = number>(key: string, fallback?: T): T | undefined {
        const value = getVariable(key);
        return value === undefined ? fallback : (value as T);
    }

    // ─── Determinism ──────────────────────────────────────────────────────────

    /** See {@link Stage.random}. */
    random(seed: string | number = 0): Random {
        let source = this._sources.get(seed);
        if (!source) {
            source = new Random(seed);
            this._sources.set(seed, source);
        }
        return source;
    }

    /** Every {@link Random} handed out this pass, keyed by seed, so {@link reset}
     *  can rewind them all to the start of their sequences. */
    private _sources: Map<string | number, Random> = new Map();

    /**
     * Rewind all stateful generators so the next replay is identical to the
     * first. Called by the runtime before each build.
     *
     * Each cached {@link Random} is reset to its seed (rather than dropped) so a
     * generator that re-calls `random(seed)` on replay gets back the same source
     * at the head of its sequence — preserving determinism even for the
     * unseeded default source.
     */
    reset(): void {
        for (const source of this._sources.values()) source.reset();
    }

    // ─── The canvas ───────────────────────────────────────────────────────────

    get canvas(): Canvas2D { return this.scene.canvas; }
    get time(): Readonly<NodeTime> { return this.scene.time; }
    get assets(): AssetCatalog { return this.scene.assets; }

    add(node: Node | Node[]): void {
        this.canvas.add(node);
    }

    set(props: { [K in keyof Canvas2DProps]?: Canvas2DProps[K] | (() => Canvas2DProps[K]) }): void {
        this.canvas.set(props);
    }

    to(props: Partial<Canvas2DProps>, duration: number, easing?: EasingFunction): Command<Canvas2DProps> {
        return this.canvas.to(props, duration, easing);
    }

    zoomTo(zoom: number, duration: number, ease?: EasingFunction): Command<Canvas2DProps> {
        return this.canvas.zoomTo(zoom, duration, ease);
    }

    panTo(lookAt: Vector2, duration: number, ease?: EasingFunction): Command<Canvas2DProps> {
        return this.canvas.panTo(lookAt, duration, ease);
    }

    headingTo(heading: number, duration: number, ease?: EasingFunction): Command<Canvas2DProps> {
        return this.canvas.headingTo(heading, duration, ease);
    }

    fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<Canvas2DProps> {
        return this.canvas.fillTo(to, duration, options);
    }

    overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<Canvas2DProps> {
        return this.canvas.overlayTo(to, duration, options);
    }

    get fill(): Fill { return this.canvas.fill; }
    set fill(value: Fill) { this.canvas.fill = value; }

    get overlay(): Fill { return this.canvas.overlay; }
    set overlay(value: Fill) { this.canvas.overlay = value; }

    get flow(): FlowMode { return this.canvas.flow; }
    set flow(value: FlowMode) { this.canvas.flow = value; }

    get gap(): GapSize { return this.canvas.gap; }

    get align(): Anchor { return this.canvas.align; }
    set align(value: Anchor) { this.canvas.align = value; }

    get padding(): Insets { return this.canvas.padding; }
    set padding(value: Insets) { this.canvas.padding = value; }

    get zoom(): number { return this.canvas.zoom; }
    set zoom(value: number) { this.canvas.zoom = value; }

    get origin(): Vector2 { return this.canvas.lookAt; }
    set origin(value: Vector2) { this.canvas.lookAt = value; }

    get heading(): number { return this.canvas.heading; }
    set heading(value: number) { this.canvas.heading = value; }

    // ─── Audio ────────────────────────────────────────────────────────────────
    // The clips belong to the *scene*, not to this pass: they are declared from
    // `Scene.prepareRenderAssets` and disposed with it, and a stage is rebuilt
    // every pass. So these forward rather than own.

    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        return this.scene.startSound(src, opts);
    }

    stopSound(sound: Sound): void {
        this.scene.stopSound(sound);
    }

    playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator {
        return this.scene.playSound(src, opts);
    }
}
