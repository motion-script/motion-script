import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { lerpNumber } from "@/tween/lerp";


import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import { layoutGroupChildren } from "@/layout/group-layout";
import { CornerRadiusProps, CornerRadiusResolved, resolveCornerRadius, lerpCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { CornerStyleProps, CornerStyleResolved, resolveCornerStyle, lerpCornerStyle } from "@/attributes/shape/corners/corner-style";
import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { NodeConfig } from "./node";

export interface CameraProps extends ShapeProps {
    /** Magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /** World-space point that maps to the centre of the camera viewport. */
    centerOn: Vector2;
    /** Rotation of the camera view in degrees (clockwise). */
    heading: number;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: CornerRadiusProps;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: CornerStyleProps;
}

/**
 * Camera node — a card that holds its own little world. It draws itself like a
 * {@link Rect} (fill, stroke, shadow, corners), then renders its children
 * through a viewport transform defined by `zoom`, `centerOn`, and `heading`.
 * The camera's own layout rect is both the card and the viewport bounds; the
 * world is clipped to that rect so nothing spills outside the card.
 *
 * Unlike `Rect` it runs no flex/stack layout — children are laid out stack-style
 * (centered) and then viewed through the camera transform.
 */
export class Camera extends ShapeNode<CameraProps> {

    /** Magnification factor (default: 1). */
    declare zoom: number;
    /** World-space focus point (default: {x:0, y:0}). */
    declare centerOn: Vector2;
    /** View rotation in degrees (default: 0). */
    declare heading: number;

    @property({ default: 0, mapper: (v: CornerRadiusProps, p?: CornerRadiusResolved) => resolveCornerRadius(v, p), tween: lerpCornerRadius })
    declare readonly cornerRadius: CornerRadiusResolved;
    @property({ default: "rounded", mapper: (v: CornerStyleProps, p?: CornerStyleResolved) => resolveCornerStyle(v, p), tween: lerpCornerStyle })
    declare readonly cornerStyle: CornerStyleResolved;

    constructor(props: NodeConfig<Camera, CameraProps>) {
        super(props);
        this.applyProp("zoom", props.zoom ?? 1, { tween: lerpNumber });
        this.applyProp("centerOn", props.centerOn ?? { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", props.heading ?? 0, { tween: lerpNumber });
    }

    // ---- Drawing ----------------------------------------------------------

    // The card behind the world — the camera's viewport frame.
    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .rect({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
    }

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // ---- Layout -----------------------------------------------------------

    // No flex/stack layout — the base Node only lays out itself, so the world
    // (children) needs a layout pass too or it renders at zero size. Lay them
    // out stack-style (centered); they're then viewed through the camera.
    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);
        layoutGroupChildren(this._children, rect, scope);
    }

    // ---- Rendering --------------------------------------------------------

    // Render the world through the camera viewport transform instead of the
    // straight `renderChildren` ShapeNode uses for its content.
    override renderChildren(ctx: RenderContext): void {
        const rect = this.layoutRect;
        const w = rect?.width ?? 0;
        const h = rect?.height ?? 0;
        const cx = rect?.x ?? 0;
        const cy = rect?.y ?? 0;

        ctx.beginCamera(
            { x: cx, y: -cy, width: w, height: h },
            this.centerOn,
            this.zoom,
            this.heading,
        );

        for (const child of this._children) child.render(ctx);

        ctx.endCamera();
    }
}
