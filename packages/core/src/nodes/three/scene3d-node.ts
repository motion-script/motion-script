import { Graphics } from "@/render/graphics";
import { RasterizedSurface, RenderContext } from "@/render/render-context";
import { Graphics3D } from "@/render3d/graphics3d";
import { warmScene3D } from "@/render3d/resources";
import type { Disposer } from "@/assets/record";
import { Rect, RectProps } from "../geometry/rect-node";
import { NodeConfig } from "../base/node";
import { Surface2D } from "./surface2d-node";

/**
 * Builds a 3D scene. Called once per rendered frame with a fresh
 * {@link Graphics3D} and the node's elapsed time in seconds. Record into `g` and
 * either return it or return nothing.
 */
export type Scene3DBuilder = (g: Graphics3D, time: number) => Graphics3D | void;

export interface Scene3DProps extends RectProps {
    /**
     * Builds this node's 3D content — see {@link Scene3DBuilder}.
     *
     * Deliberately **not** a signal-backed `@property`. `Node._writeProp` treats
     * any function-valued prop as a *reactive binding*: it would call the builder
     * with no arguments and cache whatever came back. So this is read off the
     * constructor props into a plain field instead. Two consequences worth
     * knowing:
     *
     *  - `node.set({ scene })` and `node.to({ scene })` do nothing (`Node.set`
     *    skips keys with no registered signal). Use {@link Scene3D.setScene}.
     *  - the builder itself can't be tweened — which is fine, because animation
     *    belongs *inside* it. Read signals while building and the scene animates:
     *
     *        const spin = createSignal(0);
     *        <Scene3D scene={g => g.box({ rotation: [0, spin(), 0] })} />
     *        yield* spin(360, 2, easeInOut());
     */
    scene?: Scene3DBuilder;
    /**
     * Ceiling on the 3D buffer's device-pixel ratio. Default 2.
     *
     * Lower it for an expensive scene: the 3D renders at a smaller buffer and is
     * scaled up on composite, which trades sharpness for fill rate.
     */
    maxPixelRatio?: number;
    /** Multisample the 3D pass. Default true. */
    antialias?: boolean;
}

/**
 * A 3D viewport embedded in the 2D scene — the one and only 3D node.
 *
 * There is deliberately no 3D node *tree*. Motion Script's `NodeProps` are 2D
 * concepts (`x`/`y`/`width`/`opacity`/`flex`/`padding`/anchors) that mean nothing
 * for a mesh positioned in 3D space, so instead of bending every node to fit,
 * `Scene3D` occupies one ordinary layout box and everything inside it is
 * described with {@link Graphics3D}.
 *
 * It extends {@link Rect}, so it is a completely ordinary 2D node: it lays out in
 * flex/stack groups, takes `cornerRadius` and `clip`, can be masked, blended and
 * filtered, and can hold 2D children as a HUD drawn over the 3D.
 *
 *   <Scene3D width="fill" height="fill" cornerRadius={24} clip
 *       scene={g => g
 *           .perspective({ position: [0, 2, 6], lookAt: 0 })
 *           .ambient({ intensity: 0.4 })
 *           .box({ width: 2, color: "tomato", rotation: [0, spin(), 0] })}
 *   />
 *
 * Paint order falls out of the op list rather than needing special cases:
 * `shadow` and `fill` paint *beneath* the 3D (so a gradient shows through a
 * transparent render), children and `overlay` and `stroke` paint *over* it.
 *
 * The one child that doesn't paint over the 3D is {@link Surface2D}, which goes
 * *into* it: its subtree is rendered to an offscreen buffer before the composite
 * and bound to a material by name, so 2D content can live on 3D geometry.
 *
 *   <Scene3D scene={g => g.plane({ map: Tex.surface("screen") })}>
 *       <Surface2D name="screen" width={1024} height={640}>…</Surface2D>
 *   </Scene3D>
 *
 * For a reusable component, subclass and override {@link scene3D}:
 *
 *   class Turntable extends Scene3D {
 *       readonly angle = createSignal(0);
 *       protected override scene3D(g: Graphics3D) {
 *           return g.perspective({ position: orbit(this.angle()), lookAt: 0 })
 *                   .torus({ radius: 1.5, tube: 0.4, color: "tomato" });
 *       }
 *   }
 */
export class Scene3D<P extends Scene3DProps = Scene3DProps> extends Rect<P> {
    /** See {@link Scene3DProps.scene} for why this isn't a signal. */
    private _build?: Scene3DBuilder;
    private readonly _maxPixelRatio: number;
    private readonly _antialias: boolean;

    constructor(props?: NodeConfig<Scene3D<P>, P>) {
        super((props ?? {}) as NodeConfig<any, P>);

        const scene = (props as Scene3DProps | undefined)?.scene;
        if (typeof scene === "function") this._build = scene;

        const maxPixelRatio = (props as Scene3DProps | undefined)?.maxPixelRatio;
        this._maxPixelRatio = typeof maxPixelRatio === "number" ? maxPixelRatio : 2;
        this._antialias = (props as Scene3DProps | undefined)?.antialias !== false;
    }

    /**
     * Replace the scene builder. Needed because `scene` is not signal-backed, so
     * `set({ scene })` is a no-op — see {@link Scene3DProps.scene}.
     */
    setScene(build: Scene3DBuilder): void {
        this._build = build;
    }

    /**
     * Build this node's 3D content. Override in a subclass for a reusable 3D
     * component; the default runs the `scene` prop.
     *
     * This mirrors {@link Rect.shapeGraphics} as a single override seam: both the
     * real render and the asset-tracking replay go through it, so what gets
     * loaded can never drift from what gets drawn.
     *
     * Called from {@link renderSelf} — inside the synchronous render pass, after
     * the frame's state has been evaluated and layout resolved — so every signal
     * read here samples the *current* frame. That is what makes a 3D scene
     * seekable: frame N is identical whether it was reached by playing forward or
     * by scrubbing backwards, because nothing accumulates.
     *
     * @param g     A fresh, empty recorder.
     * @param time  This node's elapsed time in seconds. Use it for procedural
     *              motion (waves, noise) that isn't driven by a tween. For the
     *              scene's absolute time, read `this.clock.time`.
     */
    protected scene3D(g: Graphics3D, time: number): Graphics3D | void {
        return this._build?.(g, time);
    }

    /**
     * A 3D viewport has no intrinsic size and shouldn't be sized by its overlay
     * children — hugging a HUD label would collapse the viewport to the size of
     * the text. So it fills unless given an explicit size, whether or not it has
     * children (which is where this diverges from {@link Rect}).
     */
    protected override applyDefaultSize(props?: NodeConfig<any, P>): void {
        if (!props || props.width === undefined) this.applyProp("width", "fill");
        if (!props || props.height === undefined) this.applyProp("height", "fill");
    }

    /**
     * Start loading the 3D runtime.
     *
     * `prepareRenderAssets()` runs during precomp — before any frame is drawn —
     * and is fire-and-forget, so the runtime is normally resident by the time the
     * first 3D frame paints and the render pass stays synchronous. The renderer
     * keeps a per-frame fallback for the case where it isn't. No-op when no
     * rendering backend has registered a 3D runtime.
     */
    override prepareRender(): Promise<void | Disposer> | void {
        return warmScene3D();
    }

    /**
     * The built 3D scene for this frame, or `null` when there's nothing to draw —
     * in which case the node renders as a plain {@link Rect} and the renderer
     * never touches a GPU context.
     */
    private buildScene3D(): Graphics3D | null {
        const recorder = new Graphics3D();
        const returned = this.scene3D(recorder, this.clock.elapsed);
        const built = returned instanceof Graphics3D ? returned : recorder;
        return built.isEmpty() ? null : built;
    }

    /**
     * Rasterize every {@link Surface2D} child into an offscreen buffer, keyed by
     * its `textureName` so a `Tex.surface(name)` map can find it.
     *
     * Runs *before* this node's own `draw()` — deliberately. The shape
     * accumulator for this node is still empty at that point (nothing to
     * clobber), and more importantly the buffers are this frame's, so a scrubbed
     * frame is identical to a played one. Rendering the surfaces from the
     * ordinary child walk instead would leave the composite one frame stale.
     */
    private rasterizeSurfaces(ctx: RenderContext): ReadonlyMap<string, RasterizedSurface> | undefined {
        let surfaces: Map<string, RasterizedSurface> | undefined;
        for (const child of this.children) {
            if (!(child instanceof Surface2D)) continue;
            const raster = child.renderOffscreen(ctx);
            if (!raster) continue;
            (surfaces ??= new Map()).set(child.textureName, raster);
        }
        return surfaces;
    }

    protected override renderSelf(ctx: RenderContext): void {
        // Surfaces first: a Tex.surface(...) map recorded by the builder below
        // needs its pixels in hand by the time the op is replayed.
        const surfaces = this.rasterizeSurfaces(ctx);

        // The rect carries the node's 2D paint and doubles as the destination for
        // the 3D composite. Stroke is deferred to renderStroke (after children).
        const g: Graphics = this.shapeGraphics().shadow(this.shadow).fill(this.fill);

        const three = this.buildScene3D();
        if (three) {
            // Fail loudly at the author's source rather than silently reparenting
            // everything after an unclosed group.
            three.assertBalanced();
            const rect = this.layoutRect;
            g.scene3D(three, {
                width: rect.width,
                height: rect.height,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                maxPixelRatio: this._maxPixelRatio,
                antialias: this._antialias,
                surfaces,
            });
        }

        ctx.draw(g);
    }
}
