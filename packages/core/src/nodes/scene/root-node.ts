import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { TweenOptions } from "@/tween/lerp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { wait } from "@/tween/wait";
import { tween } from "@/tween/tween";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { InsetsResolved } from "@/attributes/layout/insets";
import { MeasureScope } from "@/render/measure-scope";
import { Anchor } from "@/attributes/layout/anchor";
import { GapSize } from "@/layout/flex";
import { FlowLayout, FlowHost, FlowMode } from "@/layout/flow-engine";
import { resolveFillArray, lerpFillArray, prepareFill } from "@/attributes/shape/fill/registry";
import { FillResolved } from "@/attributes/shape/fill/union";
import { AssetTracker } from "@/assets/tracker";
import { Fill } from "@/attributes/shape/fill/chain";
import { CameraScope, Node, NodeConfig, NodeProps } from "../base/node";
import { property } from "@/attributes/properties/decorator";
import { anchorProperty, fillProperty } from "@/attributes/properties/typed";

/** @internal */
export interface RootProps extends NodeProps {
    /**
     * Background fill layer(s). Each item can be a CSS color string, a fill
     * prop object, an already-resolved fill, or a {@link FillChain} from the
     * `Fills` builder. Painted behind the scene's children.
     */
    fill: Fill;
    /**
     * Overlay layer(s) — same loose values as {@link fill}, but painted *over*
     * the fill **and** the children (clipped to the viewport). Use for textures
     * laid across the whole scene, e.g. a VHS-grain image or video.
     */
    overlay: Fill;
    /** Layout mode for children: flex `horizontal` / `vertical`, or overlapping `freeform`. */
    flow: FlowMode;
    /** Spacing between children along the layout's main axis. */
    gap: GapSize;
    /**
     * Alignment of children within the content box: a named position
     * (`'center'`, `'topLeft'`, …) or an explicit per-axis pivot `Vector2`
     * (x: -1 left … +1 right, y: -1 bottom … +1 top).
     */
    align: Anchor;
    /** Camera magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /** World-space point that maps to the centre of the viewport. */
    lookAt: Vector2;
    /** Rotation of the camera view in degrees (clockwise). */
    heading: number;
}

/**
 * The single root container every {@link Scene} builds into.
 *
 * A `RootNode` is a plain {@link Node} that doubles as the scene's layout frame
 * and camera. It lays its children out (flex `horizontal`/`vertical` or
 * `freeform`, with `gap`, `align`, `padding`) and paints a scene-wide background
 * (`fill`) and `overlay` — *and* views those laid-out children through a viewport
 * transform (`zoom`, `lookAt`, `heading`).
 *
 * Unlike a {@link Rect} it is **not a shape**: it has no stroke, shadow, corner,
 * or `start`/`end` props. It carries only the scene-wide concerns — background
 * paint, child layout, and camera — so `stage.fill`, `stage.flow`, etc. read
 * the root directly without exposing per-shape geometry the scene root never has.
 *
 * It is also the frame absolutely-positioned nodes anywhere in the tree are
 * pinned to — see {@link NodeProps.childPositioning}.
 *
 * The flex/freeform child layout (including the cross-mode `flow` blend) is the
 * same {@link FlowLayout} engine {@link Rect} uses; this node implements
 * {@link FlowHost} so the engine can read it.
 */
/** @internal */
export class RootNode extends Node<RootProps> implements FlowHost {

    // ---- Background paint -------------------------------------------------
    // Author-facing paint props. Like Rect, the declared type is the loose
    // `Fill` so assignment (`this.fill = 'red'`) and reads share one type; the
    // @property accessor stores the *resolved* value via the mapper.
    @fillProperty()
    declare fill: Fill;
    @fillProperty()
    declare overlay: Fill;

    // ---- Layout container -------------------------------------------------
    @property({ default: 0 }) declare readonly gap: GapSize;
    // Declared loose as `Anchor` (covers `this.align = 'center'`); the
    // accessor stores the resolved per-axis `Vector2` pivot. See Rect.
    @anchorProperty()
    declare align: Anchor;
    // `flow` has a closure-based tween (the engine captures the in-flight
    // blend), so it's applied via applyProp rather than a static @property.
    declare flow: FlowMode;

    // ---- Camera -----------------------------------------------------------
    /** Camera magnification factor (default: 1). */
    @property({ default: 1 }) declare zoom: number;
    /** World-space focus point (default: {x:0, y:0}). */
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 }) declare lookAt: Vector2;
    /** Camera view rotation in degrees (default: 0). */
    @property({ default: 0 }) declare heading: number;

    // Flex/freeform child layout (including the `flow` blend) lives in the shared
    // engine so Rect and RootNode don't each carry a copy.
    private readonly _flowLayout = new FlowLayout(this);

    constructor(props: NodeConfig<RootNode, RootProps>) {
        super(props);
        this.applyFlowProp(props.flow ?? "freeform");
    }

    // flow's tween captures the engine's in-flight blend, so it can't be a
    // static @property decorator. Shared by the constructor and reinitProps so a
    // disposed-then-reused root keeps the same binding. Defaults to "freeform".
    private applyFlowProp(initial: FlowMode | (() => FlowMode)): void {
        this.applyProp<FlowMode>("flow", initial, { tween: this._flowLayout.flowTween });
    }

    // Re-apply the constructor-specific prop defaults after the base class
    // re-creates its signals (disposed-then-reused root), or — with `force` —
    // resets live-but-tweened props back to their defaults before a rebuild.
    protected override reinitProps(force = false): void {
        if (this.__signals && !force) return;
        super.reinitProps(force);
        this.applyFlowProp("freeform");
    }

    // ---- FlowHost ---------------------------------------------------------

    // The root has no stroke, so effective padding is just the resolved padding.
    effectivePadding(): InsetsResolved {
        return this.padding as InsetsResolved;
    }

    // ---- Camera motion commands -------------------------------------------
    // Mirror the Camera node's viewport commands.

    /**
     * Animate the magnification factor (`zoom`). Values > 1 zoom in; < 1 zoom out.
     *
     * @example
     * yield* root.zoomTo(2, 0.5, ease.outCubic);
     */
    *zoomTo(zoom: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ zoom } as Partial<RootProps>, duration, ease);
    }

    /**
     * Animate the world-space focus point (`lookAt`) — the point that maps to
     * the centre of the viewport.
     *
     * @example
     * yield* root.panTo({ x: 200, y: -100 }, 0.6, ease.inOutQuad);
     */
    *panTo(lookAt: Vector2, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ lookAt } as Partial<RootProps>, duration, ease);
    }

    /**
     * Animate the view rotation (`heading`) in degrees (clockwise).
     *
     * @example
     * yield* root.headingTo(45, 0.4);
     */
    *headingTo(heading: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ heading } as Partial<RootProps>, duration, ease);
    }

    // ---- Paint commands ---------------------------------------------------

    *fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.fill as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ fill: lerp(from, target, ease ? ease(t) : t) });
        });
    }

    *overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.overlay as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ overlay: lerp(from, target, ease ? ease(t) : t) });
        });
    }

    // ---- Measure / layout -------------------------------------------------
    // Delegated to the shared FlowLayout engine, which reads this node through
    // the FlowHost interface.

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        return this._flowLayout.measure(constraints, scope);
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        this.setLayoutRect(rect);
        this._flowLayout.layout(rect, scope);
    }

    // ---- Drawing ----------------------------------------------------------

    // The viewport-sized background box behind the children.
    private shapeGraphics(): Graphics {
        return new Graphics().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
        });
    }

    protected override renderSelf(draw: RenderContext): void {
        const fill = this.fill as FillResolved[];
        if (fill.length === 0) return;
        draw.draw(this.shapeGraphics().fill(fill));
    }

    // Overlay over fill + children, clipped to the viewport silhouette.
    protected override renderOverlay(ctx: RenderContext): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        ctx.draw(this.shapeGraphics().fill(overlay));
    }

    /**
     * The scene background and its overlay.
     *
     * This extends `Node` rather than `ShapeNode` — it is the world container,
     * not a shape — so it carries its own `fill`/`overlay` and declares them
     * itself. A scene whose background is an image or a video lives here.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const rect = this.layoutRect;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        for (const fill of this.fill as FillResolved[]) prepareFill(fill, tracker, width, height);
        for (const fill of this.overlay as FillResolved[]) prepareFill(fill, tracker, width, height);
    }

    // The viewport outline — used for `clip` and as the area backdrop effects
    // are confined to.
    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
        });
    }

    // ---- Rendering --------------------------------------------------------

    // Children are laid out by the flow engine; here we view that laid-out
    // world through the camera viewport transform, the same way the Camera node
    // does. When the camera is at rest (zoom 1, no heading, origin at 0) this is
    // the identity, so a plain layout root pays nothing extra.
    // Non-null exactly when renderChildren below opens a camera, so a consumer
    // reproducing the render transform (node picking) inserts the same scope in
    // the same place — and skips it on the at-rest fast path, where the renderer
    // pushes nothing at all.
    override _cameraScope(): CameraScope | null {
        if (this.zoom === 1 && this.heading === 0 && this.lookAt.x === 0 && this.lookAt.y === 0) return null;
        return { lookAt: this.lookAt, zoom: this.zoom, heading: this.heading };
    }

    override renderChildren(ctx: RenderContext): void {
        if (this.zoom === 1 && this.heading === 0 && this.lookAt.x === 0 && this.lookAt.y === 0) {
            super.renderChildren(ctx);
            return;
        }

        const rect = this.layoutRect;
        const w = rect?.width ?? 0;
        const h = rect?.height ?? 0;
        const cx = rect?.x ?? 0;
        const cy = rect?.y ?? 0;

        ctx.beginCamera(
            { x: cx, y: -cy, width: w, height: h },
            this.lookAt,
            this.zoom,
            this.heading,
        );

        for (const child of this._children) child.render(ctx);

        ctx.endCamera();
    }
}
