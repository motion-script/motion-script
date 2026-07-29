import { RenderContext } from "@/render/render-context";
import { Graphics3D } from "@/render3d/graphics3d";
import { warmView3D } from "@/render3d/resources";
import { forEachTexture3D } from "@/render3d/walk";
import { isSurfaceTexture3D, resolveSurfaceSource } from "@/render3d/texture";
import type { Disposer } from "@/assets/record";
import { Fills, resolveChainFill } from "@/attributes/shape/fill/chain";
import { property } from "@/attributes/properties/decorator";
import { Rect, RectProps } from "../geometry/rect-node";
import { NodeConfig } from "../base/node";

export interface View3DProps extends RectProps {
    /**
     * The 3D scene to draw, as a **built** {@link Graphics3D} — never a builder
     * callback.
     *
     * Being a value rather than a function is what lets this be an ordinary
     * signal-backed `@property`: `set({ graphics3D })` and a `() => …` reactive
     * binding both work, exactly like every other prop.
     *
     * Per-frame freshness comes from where the value is produced. A subclass
     * overriding {@link View3D.buildGraphics3D} gets it for free, because that
     * runs inside `renderSelf` on every frame. A `() => …` binding is memoized
     * against the *signals* it reads, so it re-evaluates whenever a tween moves —
     * but note it will **not** re-evaluate for `clock.elapsed`, which is a plain
     * field and not a signal. Procedural motion belongs on a tweened signal (which
     * is also what makes it seekable) or inside `buildGraphics3D`.
     */
    graphics3D: Graphics3D;
    /**
     * Ceiling on the 3D buffer's device-pixel ratio. Default 2.
     *
     * Lower it for an expensive scene: the 3D renders at a smaller buffer and is
     * scaled up on composite, which trades sharpness for fill rate.
     */
    maxPixelRatio: number;
    /** Multisample the 3D pass. Default true. */
    antialias: boolean;
}

/**
 * A 3D viewport embedded in the 2D scene.
 *
 * Sugar, not machinery: a `View3D` is a {@link Rect} that appends its scene to its
 * own `fill` as a `view3D` layer. The primitive is the fill, so 3D is not tied to
 * this node at all — `<Ellipse fill={g3} />` and `<Text fill={g3} />` work just as
 * well, painting the scene through those shapes' own paths.
 *
 *   <View3D width="fill" height="fill" cornerRadius={24}
 *       graphics3D={() => new Graphics3D()
 *           .perspective({ position: [0, 2, 6], lookAt: 0 })
 *           .ambient({ intensity: 0.4 })
 *           .box({ width: 2, color: "tomato", rotation: [0, spin(), 0] })}
 *   />
 *
 * Paint order falls out of the fill stack rather than needing special cases: the
 * author's own `fill` layers paint first and the 3D goes on top of them, while
 * children, `overlay` and `stroke` still paint over everything. `cornerRadius` and
 * `cornerStyle` confine the 3D because it is shaded through this rect's path.
 *
 * There is deliberately no 3D node *tree*. `NodeProps` are 2D concepts
 * (`x`/`y`/`width`/`opacity`/`flex`/`padding`/anchors) that mean nothing for a
 * mesh positioned in 3D space, so everything inside is described with
 * {@link Graphics3D} instead.
 *
 * For a reusable component, subclass and override {@link buildGraphics3D}:
 *
 *   class Turntable extends View3D {
 *       readonly angle = createSignal(0);
 *       protected override buildGraphics3D(): Graphics3D {
 *           return new Graphics3D()
 *               .perspective({ position: orbit(this.angle()), lookAt: 0 })
 *               .torus({ radius: 1.5, tube: 0.4, color: "tomato" });
 *       }
 *   }
 */
export class View3D<P extends View3DProps = View3DProps> extends Rect<P> {

    @property() declare graphics3D: Graphics3D | undefined;
    @property({ default: 2 }) declare maxPixelRatio: number;
    @property({ default: true }) declare antialias: boolean;

    constructor(props?: NodeConfig<View3D<P>, P>) {
        super((props ?? {}) as NodeConfig<any, P>);
    }

    /**
     * The 3D scene for this frame, or nothing to draw none.
     *
     * Override in a subclass for a reusable 3D component; the default returns the
     * {@link View3DProps.graphics3D} prop.
     *
     * This mirrors {@link Rect.shapeGraphics} as a single seam: both the real
     * render and the asset-tracking replay go through it, so what gets loaded can
     * never drift from what gets drawn.
     *
     * Called from {@link renderSelf} — inside the synchronous render pass, after
     * the frame's state has been evaluated and layout resolved — so every signal
     * read here samples the *current* frame. That is what makes a 3D scene
     * seekable: frame N is identical whether it was reached by playing forward or
     * by scrubbing backwards, because nothing accumulates. Use `this.clock.elapsed`
     * for procedural motion that isn't driven by a tween.
     */
    protected buildGraphics3D(): Graphics3D | void {
        return this.graphics3D;
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
        return warmView3D();
    }

    /**
     * Bind every `Node` used as a {@link Tex.surface} source in this scene.
     *
     * A source node is detached — it is a value in a descriptor, not a child — so
     * nothing else would ever hand it an asset catalog, a context map or a clock.
     * This node has all three, and is the only thing that knows the scene, so it
     * adopts them. See {@link Node.adoptDetached}.
     *
     * Runs once the scene is built, because that is the first moment the
     * descriptors exist; the pixels themselves are rasterized later, by the
     * renderer painting the fill.
     */
    private bindSurfaceSources(g3: Graphics3D): void {
        forEachTexture3D(g3, (texture) => {
            if (!isSurfaceTexture3D(texture)) return;
            const source = resolveSurfaceSource(texture.source);
            if (source.kind === "node") this.adoptDetached(source.node);
        });
    }

    protected override renderSelf(ctx: RenderContext): void {
        const built = this.buildGraphics3D();
        const g3 = built instanceof Graphics3D && !built.isEmpty() ? built : null;

        if (g3) {
            // Fail loudly at the author's source rather than silently reparenting
            // everything after an unclosed group.
            g3.assertBalanced();
            this.bindSurfaceSources(g3);
        }

        // The author's own fill layers stay first, so a `fill` still paints
        // *beneath* the 3D; the scene goes on top as one more layer.
        const fill = g3
            ? [
                ...resolveChainFill(this.fill),
                ...Fills.view3D(g3, {
                    maxPixelRatio: this.maxPixelRatio,
                    antialias: this.antialias,
                }),
            ]
            : this.fill;

        // Stroke is deferred to renderStroke (drawn after children + overlay).
        ctx.draw(this.shapeGraphics().shadow(this.shadow).fill(fill));
    }
}
