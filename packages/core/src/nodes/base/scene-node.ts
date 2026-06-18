import { Node, NodeConfig } from "./node";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { Rect, RectProps } from "../geometry/rect-node";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { Size2D } from "@/attributes/layout/size";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import { RenderContext } from "@/render/render-context";

/**
 * How a nested scene scales itself into the box it occupies. A subset of
 * {@link ImageFit} — `tile` is excluded (a rendered scene has no shader-tiling
 * equivalent). Any other value is treated as `'fit'`.
 */
export type SceneFit = 'fit' | 'fill' | 'stretch';

export type BaseSceneConfig = NodeConfig<any, RectProps> & {
    /** Child scenes used for asset preloading and composite sequencing. */
    scenes?: Scene[];
    /**
     * When set, a scene nested inside another scene acts almost like an image:
     * it lays its children out against the *full viewport* (as if it were the
     * top-level scene), renders that whole world, then scales it to fit the box
     * it occupies — `'fit'` (contain), `'fill'` (cover), or `'stretch'`
     * (distort). Unset (default) keeps the old behaviour: the scene lays out
     * against its own cell and its content reflows.
     */
    fit?: SceneFit;
};

/**
 * Compute the per-axis scale that fits a `viewport`-sized world into `cell`.
 * Mirrors the image-fit scale math (`computeImageMatrix` in the web package):
 * `fit` = contain (min), `fill` = cover (max), `stretch` = per-axis. Both the
 * cell and the world are centred at the same origin, so no translation is
 * needed — scaling about the origin keeps the world centred in the cell.
 */
export function computeSceneFit(
    fit: SceneFit,
    viewport: Size2D,
    cell: { width: number; height: number },
): { scaleX: number; scaleY: number } {
    const W = viewport.width || 1;
    const H = viewport.height || 1;
    const fx = cell.width / W;
    const fy = cell.height / H;
    if (fit === 'stretch') return { scaleX: fx, scaleY: fy };
    if (fit === 'fill') { const s = Math.max(fx, fy); return { scaleX: s, scaleY: s }; }
    // 'fit' (contain) — also the fallback for any unexpected value.
    const s = Math.min(fx, fy);
    return { scaleX: s, scaleY: s };
}

export abstract class Scene extends Rect {

    /** Child scenes declared up-front. Used by buildChildren() and asset preloading. */
    readonly scenes: Scene[];

    /**
     * When set, a scene nested in another scene lays out against the full
     * viewport and scales to fit its cell. See {@link SceneFit}. Unset on
     * top-level scenes (they already fill the viewport).
     */
    @property() declare fit?: SceneFit;

    /** Sounds created via sound() / playSound() — auto-ticked and auto-prepared. */
    private _managedSounds: Sound[] = [];

    /** Full viewport this scene fits its world into (set by the framework). */
    private _viewport: Size2D | null = null;

    /** The box this scene occupies in its parent, captured during layout(). */
    private readonly _cell: BoxBounds = { x: 0, y: 0, width: 0, height: 0 };

    constructor(config: BaseSceneConfig = {}) {
        // `fit` stays in nodeConfig so the base constructor auto-applies it like
        // any other @property; only `scenes` (not a reactive prop) is stripped.
        const { scenes, ...nodeConfig } = config;
        super({
            width: 'fill',
            height: 'fill',
            group: 'stack',
            ...(nodeConfig as NodeConfig<any, RectProps>),
        });

        this.scenes = scenes ?? [];
    }

    /**
     * The full viewport this scene renders its world against. Set on top-level
     * scenes by the playback engine; inherited by nested scenes from the nearest
     * ancestor scene. Used by a `fit` scene to scale its full-viewport world
     * into its cell.
     */
    get viewportSize(): Size2D | null {
        if (this._viewport) return this._viewport;
        // Nested scene: inherit from the nearest ancestor scene.
        for (let n = this.parent; n; n = n.parent) {
            if (n instanceof Scene && n._viewport) return n._viewport;
        }
        return null;
    }

    /** Record the full viewport (called by the playback engine for top-level scenes). */
    setViewport(size: Size2D): void {
        this._viewport = { width: size.width, height: size.height };
    }

    // ---- Fit layout / render ----------------------------------------------

    /** The viewport a `fit` scene lays out against; falls back to the cell. */
    private fitViewport(cell: BoxBounds): Size2D {
        const vp = this.viewportSize;
        if (vp && vp.width > 0 && vp.height > 0) return vp;
        return { width: cell.width, height: cell.height };
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        if (!this.fit) { super.layout(rect, scope); return; }

        // Remember the cell we occupy in the parent — applyTransform positions us
        // there and renderSelf draws our card at that size.
        this._cell.x = rect.x;
        this._cell.y = rect.y;
        this._cell.width = rect.width;
        this._cell.height = rect.height;

        // Lay our children out against the full viewport, exactly as the playback
        // engine does for a top-level scene: flex/stack positions are centred
        // local offsets (independent of rect.x/y), so they form a viewport-sized
        // world centred at the origin. Drop the measure the parent cached against
        // the smaller cell first, so Rect.layout recomputes children against the
        // viewport bounds — otherwise fill/hug children would size to the cell.
        this.invalidateMeasure();
        const vp = this.fitViewport(rect);
        super.layout({ x: 0, y: 0, width: vp.width, height: vp.height }, scope);

        // super.layout() set layoutRect to the viewport; restore it to the cell so
        // applyTransform positions us in the parent and renderSelf draws our card
        // at cell size (Node.layout just stores the rect).
        Node.prototype.layout.call(this, rect, scope);
    }

    override renderChildren(ctx: RenderContext): void {
        if (!this.fit) { super.renderChildren(ctx); return; }

        // The active node transform has already positioned the canvas at the
        // cell centre. Clip to the cell and scale the viewport-sized world down
        // to fit, then render the world.
        const cell = this._cell;
        const vp = this.fitViewport(cell);
        const { scaleX, scaleY } = computeSceneFit(this.fit, vp, cell);
        ctx.beginSceneFit(this.clipSelf(), scaleX, scaleY);
        super.renderChildren(ctx);
        ctx.endSceneFit();
    }

    /** Clear all dynamically-added children and managed sounds, and reset the clock. */
    reset(): void {
        // A scene instance is owned by the project config and reused across
        // playback controllers (StrictMode double-mount, HMR). A prior
        // controller's dispose() frees this scene's own signals; restore them
        // from defaults before rebuilding so reads like `this.stroke` are valid.
        this.reinitProps();
        for (const child of this.children) child.dispose();
        this.clearChildren();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }

    override tick(time: number): void {
        for (const s of this._managedSounds) s.tick(time);
    }

    abstract build(stage: BuildStage): FrameGenerator;

    /** Add a node (or array of nodes) as a child of this scene. */
    add(node: Node | Node[]): void {
        if (Array.isArray(node)) {
            this.addChildren(node);
        } else {
            this.addChild(node);
        }
    }

    /**
     * Start a sound on the scene's audio timeline without blocking, and return
     * the {@link Sound} handle. Pair with {@link stopSound} to end playback —
     * handy for running audio in parallel with visuals without nesting `all()`.
     *
     * The returned handle stays managed (auto-ticked, auto-prepared) until the
     * scene resets, so you can also let a bounded clip stop on its own.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // The asset catalog is bound on the node, so the full-length default for
        // trimEnd can only be resolved here, not at Sound construction time.
        if (s.trimEnd === Infinity && !s.loop) {
            s.trimEnd = this.assets.getMediaDuration(s.src);
        }
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
     * Use as `yield* this.playSound(...)` inside a scene generator.
     */
    *playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // The asset catalog is bound on the node, so the full-length default for
        // trimEnd can only be resolved here, not at Sound construction time.
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



    override prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        for (const s of this._managedSounds) s.prepare(tracker);
    }

    /**
     * Mount a child scene, run its build() to completion (its frames spliced
     * into the parent's timeline), then unmount and dispose it. Any nodes the
     * parent attached before the call are preserved.
     */
    private *_buildScene(child: Scene, stage: BuildStage): FrameGenerator {
        child.reset();
        this.addChild(child);
        try {
            yield* child.build(stage);
        } finally {
            this.removeChild(child);
            child.reset();
        }
    }

    /** Run every child scene in order via buildChild(). */
    *buildAll(stage: BuildStage): FrameGenerator {
        for (const child of this.scenes) {
            yield* this._buildScene(child, stage);
        }
    }

    dispose(): void {
        super.dispose();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
        for (const child of this.scenes) child.dispose();
    }
}
