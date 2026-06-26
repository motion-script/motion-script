import { RenderContext } from "@/render/render-context";
import { lerpNumber } from "@/tween/lerp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { Rect, RectProps } from "../geometry/rect-node";
import { NodeConfig } from "./node";

export interface RootProps extends RectProps {
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
 * A `RootNode` is a {@link Rect} — so it lays its children out (flex `row`/
 * `column` or `stack`, with `gap`, `align`, `padding`) and paints itself
 * (`fill`, `stroke`, `shadow`, corners) — *and* a camera: it views those
 * laid-out children through a viewport transform (`zoom`, `origin`, `heading`).
 *
 * Folding both roles into one node makes it the natural place to hang
 * scene-wide concerns: fills/padding/group/gap for layouting, plus camera
 * control, without the author wiring up a separate {@link Camera}. Because the
 * whole scene shares one root, rendering, layout, and asset preparation each
 * walk a single tree.
 *
 * It inherits the paint commands `fillTo`/`strokeTo`/`shadowTo` from
 * {@link Rect}/`ShapeNode`, and adds the camera commands `zoomTo`,
 * `originTo`, and `headingTo`.
 */
export class RootNode extends Rect<RootProps> {

    /** Camera magnification factor (default: 1). */
    declare zoom: number;
    /** World-space focus point (default: {x:0, y:0}). */
    declare origin: Vector2;
    /** Camera view rotation in degrees (default: 0). */
    declare heading: number;

    constructor(props: NodeConfig<RootNode, RootProps>) {
        // `ref` is invariant on the node type, so the NodeConfig is cast for the
        // super call only — a RootNode is a Rect<RootProps> at runtime.
        super(props as NodeConfig<Rect<RootProps>, RootProps>);
        this.applyProp("zoom", props.zoom ?? 1, { tween: lerpNumber });
        this.applyProp("origin", props.origin ?? { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", props.heading ?? 0, { tween: lerpNumber });
    }

    // Re-apply the camera prop defaults after the base class re-creates its
    // signals (a disposed-then-reused root keeps the same camera binding), or
    // when `force` resets live-but-tweened camera props back to their defaults.
    protected override reinitProps(force = false): void {
        if (this.__signals && !force) return;
        super.reinitProps(force);
        this.applyProp("zoom", 1, { tween: lerpNumber });
        this.applyProp("origin", { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", 0, { tween: lerpNumber });
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

    // ---- Rendering --------------------------------------------------------

    // Children are laid out by Rect's flex/stack pass; here we view that
    // laid-out world through the camera viewport transform, the same way the
    // Camera node does. When the camera is at rest (zoom 1, no heading, origin
    // at 0) this is the identity, so a plain layout root pays nothing extra.
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
