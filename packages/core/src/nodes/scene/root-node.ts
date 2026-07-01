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
import { PaddingResolved } from "@/attributes/layout/padding";
import { MeasureScope } from "@/render/measure-scope";
import { AssetTracker } from "@/assets/tracker";
import { Alignment, resolveAlign, lerpAlign } from "@/attributes/layout/align";
import { GapSize } from "@/layout/flex";
import { GroupLayout, GroupHost, LayoutMode } from "@/layout/group-engine";
import { resolveFillArray, lerpFillArray, updateFill, prepareFill, hasDynamicFill } from "@/attributes/shape/fill/registry";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";
import { Node, NodeConfig, NodeProps } from "../base/node";
import { property } from "@/attributes/properties/decorator";

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
    /** Layout mode for children: flex `row` / `column`, or overlapping `stack`. */
    group: LayoutMode;
    /** Spacing between children along the layout's main axis. */
    gap: GapSize;
    /**
     * Alignment of children within the content box: a named position
     * (`'center'`, `'topLeft'`, …) or an explicit per-axis pivot `Vector2`
     * (x: -1 left … +1 right, y: -1 bottom … +1 top).
     */
    align: Alignment;
    /** Camera magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /** World-space point that maps to the centre of the viewport. */
    origin: Vector2;
    /** Rotation of the camera view in degrees (clockwise). */
    heading: number;
}

/**
 * The single root container every {@link Scene} builds into.
 *
 * A `RootNode` is a plain {@link Node} that doubles as the scene's layout frame
 * and camera. It lays its children out (flex `row`/`column` or `stack`, with
 * `gap`, `align`, `padding`) and paints a scene-wide background (`fill`) and
 * `overlay` — *and* views those laid-out children through a viewport transform
 * (`zoom`, `origin`, `heading`).
 *
 * Unlike a {@link Rect} it is **not a shape**: it has no stroke, shadow, corner,
 * or `start`/`end` props. It carries only the scene-wide concerns — background
 * paint, child layout, and camera — so `stage.fill`, `stage.group`, etc. read
 * the root directly without exposing per-shape geometry the scene root never has.
 *
 * The flex/stack child layout (including the cross-mode `group` blend) is the
 * same {@link GroupLayout} engine {@link Rect} uses; this node implements
 * {@link GroupHost} so the engine can read it.
 */
/** @internal */
export class RootNode extends Node<RootProps> implements GroupHost {

    // ---- Background paint -------------------------------------------------
    // Author-facing paint props. Like Rect, the declared type is the loose
    // `Fill` so assignment (`this.fill = 'red'`) and reads share one type; the
    // @property accessor stores the *resolved* value via the mapper.
    @property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })
    declare fill: Fill;
    @property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })
    declare overlay: Fill;

    // ---- Layout container -------------------------------------------------
    @property({ default: 0 }) declare readonly gap: GapSize;
    // Declared loose as `Alignment` (covers `this.align = 'center'`); the
    // accessor stores the resolved per-axis `Vector2` pivot. See Rect.
    @property({ default: "center", mapper: (v: Alignment) => resolveAlign(v), tween: lerpAlign })
    declare align: Alignment;
    // `group` has a closure-based tween (the engine captures the in-flight
    // blend), so it's applied via applyProp rather than a static @property.
    declare group: LayoutMode;

    // ---- Camera -----------------------------------------------------------
    /** Camera magnification factor (default: 1). */
    @property({ default: 1 }) declare zoom: number;
    /** World-space focus point (default: {x:0, y:0}). */
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 }) declare origin: Vector2;
    /** Camera view rotation in degrees (default: 0). */
    @property({ default: 0 }) declare heading: number;

    // Flex/stack child layout (including the `group` blend) lives in the shared
    // engine so Rect and RootNode don't each carry a copy.
    private readonly _groupLayout = new GroupLayout(this);

    // Does the current fill / overlay need a per-frame update() (e.g. video)?
    private _hasDynamicFill = false;
    private _hasDynamicOverlay = false;

    constructor(props: NodeConfig<RootNode, RootProps>) {
        super(props);
        this.applyGroupProp(props.group ?? "stack");
        this.watchFillForDynamic();
    }

    // group's tween captures the engine's in-flight blend, so it can't be a
    // static @property decorator. Shared by the constructor and reinitProps so a
    // disposed-then-reused root keeps the same binding. Defaults to "stack".
    private applyGroupProp(initial: LayoutMode | (() => LayoutMode)): void {
        this.applyProp<LayoutMode>("group", initial, { tween: this._groupLayout.groupTween });
    }

    // Track whether the current fill / overlay needs per-frame updates. Re-run
    // after the signals are re-created (reinitProps) so a reused scene root keeps
    // a live subscription rather than a stale one pointing at a disposed cell.
    private watchFillForDynamic(): void {
        const watch = (key: "fill" | "overlay", set: (dynamic: boolean) => void) => {
            const cell = this.__signals?.get(key);
            if (!cell) return;
            const refresh = () => set(hasDynamicFill(cell.get() as FillResolved[]));
            refresh();
            cell.subscribe(refresh);
        };
        watch("fill", d => { this._hasDynamicFill = d; });
        watch("overlay", d => { this._hasDynamicOverlay = d; });
    }

    // Re-apply the constructor-specific prop defaults after the base class
    // re-creates its signals (disposed-then-reused root), or — with `force` —
    // resets live-but-tweened props back to their defaults before a rebuild.
    protected override reinitProps(force = false): void {
        // Recreating disposed signals needs a fresh fill subscription; a forced
        // reset of live signals already has one, so don't double-subscribe.
        const recreating = !this.__signals;
        if (this.__signals && !force) return;
        super.reinitProps(force);
        this.applyGroupProp("stack");
        if (recreating) this.watchFillForDynamic();
    }

    // ---- GroupHost --------------------------------------------------------

    // The root has no stroke, so effective padding is just the resolved padding.
    effectivePadding(): PaddingResolved {
        return this.padding as PaddingResolved;
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
     * Animate the world-space focus point (`origin`) — the point that maps to
     * the centre of the viewport.
     *
     * @example
     * yield* root.originTo({ x: 200, y: -100 }, 0.6, ease.inOutQuad);
     */
    *originTo(origin: Vector2, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ origin } as Partial<RootProps>, duration, ease);
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

    // ---- Asset / per-frame paint ------------------------------------------

    public override tick(time: number): void {
        if (!this._hasDynamicFill && !this._hasDynamicOverlay) return;
        const patch: Partial<RootProps> = {};
        if (this._hasDynamicFill) {
            const fills = this.fill as FillResolved[];
            patch.fill = fills.map(fill => updateFill(fill, time, this.assets)) as Fill;
        }
        if (this._hasDynamicOverlay) {
            const overlays = this.overlay as FillResolved[];
            patch.overlay = overlays.map(fill => updateFill(fill, time, this.assets)) as Fill;
        }
        this.set(patch);
    }

    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        [
            ...(this.fill as FillResolved[]),
            ...(this.overlay as FillResolved[]),
        ].forEach(fill => prepareFill(fill, tracker, this.layoutRect.width, this.layoutRect.height));
    }

    // ---- Measure / layout -------------------------------------------------
    // Delegated to the shared GroupLayout engine, which reads this node through
    // the GroupHost interface.

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        return this._groupLayout.measure(constraints, scope);
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        this.setLayoutRect(rect);
        this._groupLayout.layout(rect, scope);
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

    // The viewport outline — used for `clip` and as the area backdrop effects
    // are confined to.
    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
        });
    }

    // ---- Rendering --------------------------------------------------------

    // Children are laid out by the group engine; here we view that laid-out
    // world through the camera viewport transform, the same way the Camera node
    // does. When the camera is at rest (zoom 1, no heading, origin at 0) this is
    // the identity, so a plain layout root pays nothing extra.
    override renderChildren(ctx: RenderContext): void {
        if (this.zoom === 1 && this.heading === 0 && this.origin.x === 0 && this.origin.y === 0) {
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
            this.origin,
            this.zoom,
            this.heading,
        );

        for (const child of this._children) child.render(ctx);

        ctx.endCamera();
    }
}
