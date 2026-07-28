import { Graphics } from "@/render/graphics";
import { RasterizedSurface, RenderContext } from "@/render/render-context";
import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { Vector2 } from "@/attributes/layout/vector2";
import { Rect, RectProps } from "../geometry/rect-node";
import { NodeConfig } from "../base/node";

/**
 * Draws a surface's 2D content. Called once per rendered frame with a fresh
 * {@link Graphics} and the node's elapsed time in seconds — the 2D mirror of
 * `Scene3DBuilder`. Record into `g` and either return it or return nothing.
 */
export type Surface2DBuilder = (g: Graphics, time: number) => Graphics | void;

export interface Surface2DProps extends RectProps {
    /**
     * The key `Tex.surface(...)` matches on. Scoped to the enclosing
     * {@link Scene3D}, so two viewports can each hold a `name="screen"`.
     * Defaults to the node's id, which is only useful via
     * `Tex.surface(surfaceRef())`.
     */
    name?: string;
    /**
     * Draw the surface with a {@link Graphics} command list, over this node's own
     * `fill` and under its children — see {@link Surface2DBuilder}.
     *
     * Deliberately **not** a signal-backed `@property`, for the same reason
     * `Scene3D.scene` isn't: `Node._writeProp` treats any function-valued prop as
     * a *reactive binding*, so it would call the builder with no arguments and
     * cache whatever came back. It's read off the constructor props into a plain
     * field instead, which means `set({ graphics })` / `to({ graphics })` do
     * nothing — use {@link Surface2D.setGraphics}. The builder can't be tweened
     * either, which is fine: animation belongs *inside* it, where a signal read
     * samples the current frame.
     */
    graphics?: Surface2DBuilder;
    /**
     * Rasterize once and reuse the buffer, instead of every frame. Default false.
     *
     * Worth setting for content that never changes — see the cost note on
     * {@link Surface2D}. A static surface still redraws if its size changes.
     */
    static?: boolean;
    /**
     * Ceiling on the offscreen buffer's device-pixel ratio. Default 1, i.e. the
     * buffer is exactly `width` × `height`.
     *
     * Unlike a 2D node — which wants to match the display — a surface is sampled
     * by a 3D material at whatever size the geometry happens to occupy on screen,
     * so the honest control is `width`/`height`. Raise this only when a surface is
     * viewed close up and reads soft.
     */
    maxPixelRatio?: number;
}

/**
 * A 2D visual rendered to an offscreen buffer so a {@link Scene3D} can paint it
 * onto geometry — a screen, a billboard, a poster, a label wrapped on a curve.
 *
 * It is an ordinary {@link Rect}: it has `fill`, `cornerRadius`, `clip`, `group`
 * layout and children, and its `width`/`height` **are the texture's resolution**
 * in pixels. Content comes from either or both of:
 *
 *  - `graphics={(g, t) => …}` — a raw {@link Graphics} command list.
 *  - JSX children — a normal node subtree (`Text`, `Image`, nested layout, …).
 *
 * Place it as a child of the `Scene3D` that uses it and reference it by name:
 *
 *   <Scene3D scene={g => g.plane({ width: 4, height: 2.5, map: Tex.surface("screen") })}>
 *       <Surface2D name="screen" width={1024} height={640} fill="#0b0d12"
 *           group="column" padding={48} gap={24}>
 *           <Text text="CPU" fontSize={64} fill="white" />
 *           <Rect width={load()} height={40} fill="#3ddc84" />
 *       </Surface2D>
 *   </Scene3D>
 *
 * Being a real child is what makes the node path work at all: it gets the asset
 * catalog (an `Image` or a webfont inside a *detached* subtree throws), inherited
 * context like the theme, and the scene clock. It never paints onto the canvas
 * itself — `Scene3D` renders it offscreen before compositing the 3D, so the
 * texture is always this frame's, and a scrubbed frame matches a played one.
 *
 * **Cost.** An animated surface is a GPU→CPU readback plus a texture upload every
 * frame (~3 MB at 1024×768). That is a real stall, so size the surface to what
 * the geometry actually shows, and set `static` when the content doesn't move.
 */
export class Surface2D<P extends Surface2DProps = Surface2DProps> extends Rect<P> {
    /** See {@link Surface2DProps.graphics} for why this isn't a signal. */
    private _build?: Surface2DBuilder;
    private readonly _name?: string;
    private readonly _static: boolean;
    private readonly _maxPixelRatio: number;

    /**
     * True only while {@link renderOffscreen} is driving this node. Everywhere
     * else the node draws nothing, so it is invisible wherever it sits in the tree
     * and can never double-paint (once into the buffer, once onto the canvas).
     */
    private _offscreen = false;

    /** Last rasterization, kept only to serve a `static` surface. */
    private _cached?: RasterizedSurface;
    private _cachedFor?: string;

    constructor(props?: NodeConfig<Surface2D<P>, P>) {
        super((props ?? {}) as NodeConfig<any, P>);

        const bag = props as Surface2DProps | undefined;
        if (typeof bag?.graphics === "function") this._build = bag.graphics;
        this._name = typeof bag?.name === "string" ? bag.name : undefined;
        this._static = bag?.static === true;
        this._maxPixelRatio = typeof bag?.maxPixelRatio === "number" ? bag.maxPixelRatio : 1;
    }

    /** The key `Tex.surface(...)` resolves against. */
    get textureName(): string {
        return this._name ?? this.id;
    }

    /**
     * Replace the graphics builder. Needed because `graphics` is not
     * signal-backed, so `set({ graphics })` is a no-op — see
     * {@link Surface2DProps.graphics}.
     */
    setGraphics(build: Surface2DBuilder): void {
        this._build = build;
        this._cached = undefined;
    }

    /**
     * A surface's box *is* its texture, so it needs a concrete pixel size rather
     * than `fill` (no viewport to fill — it isn't on the canvas) or `hug` (which
     * would make the resolution depend on whatever happens to be inside it).
     */
    protected override applyDefaultSize(props?: NodeConfig<any, P>): void {
        if (!props || props.width === undefined) this.applyProp("width", 512);
        if (!props || props.height === undefined) this.applyProp("height", 512);
    }

    /**
     * Rasterize this surface into an offscreen buffer, or `null` when the backend
     * can't (nothing is drawn to the canvas either way). Driven by the enclosing
     * {@link Scene3D} during its own `renderSelf`.
     */
    renderOffscreen(ctx: RenderContext): RasterizedSurface | null {
        const rect = this.layoutRect;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        if (width <= 0 || height <= 0) return null;

        // A static surface still has to redraw when its box changes — the cached
        // buffer is the wrong resolution at that point.
        const signature = `${width}x${height}@${this._maxPixelRatio}`;
        if (this._static && this._cached && this._cachedFor === signature) return this._cached;

        this._offscreen = true;
        let raster: RasterizedSurface | null;
        try {
            raster = ctx.rasterizeOffscreen(
                width, height, () => this.render(ctx), this._maxPixelRatio,
            );
        } finally {
            this._offscreen = false;
        }

        if (this._static && raster) {
            this._cached = raster;
            this._cachedFor = signature;
        }
        return raster;
    }

    override onRender(ctx: RenderContext): void {
        // Invisible unless we're filling the buffer. `render()` still brackets
        // this with begin()/end(), which is balanced and cheap.
        if (!this._offscreen) return;
        super.onRender(ctx);
    }

    /**
     * Offscreen, the buffer *is* this node's box, so where the node sits inside
     * its parent is irrelevant — draw it centred on the buffer's origin. The rest
     * of the transform (scale, rotation, opacity, blend, effects) still applies,
     * so a surface can be faded or filtered as a whole.
     */
    protected override applyTransform(ctx: RenderContext): void {
        if (!this._offscreen) {
            super.applyTransform(ctx);
            return;
        }
        const rect = this.layoutRect;
        ctx.transform({
            x: 0,
            y: 0,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            scale: this.scale,
            rotation: this.rotation,
            opacity: this.opacity,
            blend: this.blend,
            effects: this.effects as SceneEffect[],
            pivot: this.pivot as Vector2,
        });
    }

    protected override renderSelf(ctx: RenderContext): void {
        // Same layering rule Scene3D uses: the node's own paint goes down first,
        // the builder's ops over it, children over both. Stroke is deferred to
        // renderStroke so it frames everything.
        ctx.draw(this.shapeGraphics().shadow(this.shadow).fill(this.fill));

        if (!this._build) return;
        const recorder = new Graphics();
        const returned = this._build(recorder, this.clock.elapsed);
        ctx.draw(returned instanceof Graphics ? returned : recorder);
    }
}
