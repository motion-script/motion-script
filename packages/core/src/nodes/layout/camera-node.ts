import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { lerpNumber } from "@/tween/lerp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";


import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { RectCornerRadius, CornerRadiusResolved, resolveCornerRadius, lerpCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle, CornerStyleResolved, resolveCornerStyle, lerpCornerStyle } from "@/attributes/shape/corners/corner-style";
import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { NodeConfig } from "../base/node";

export interface CameraProps extends ShapeProps {
    /** Magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /** World-space point that maps to the centre of the camera viewport. */
    origin: Vector2;
    /** Rotation of the camera view in degrees (clockwise). */
    heading: number;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
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
    declare origin: Vector2;
    /** View rotation in degrees (default: 0). */
    declare heading: number;

    @property({ default: 0, mapper: (v: RectCornerRadius, p?: CornerRadiusResolved) => resolveCornerRadius(v, p), tween: lerpCornerRadius })
    declare cornerRadius: RectCornerRadius;
    @property({ default: "rounded", mapper: (v: RectCornerStyle, p?: CornerStyleResolved) => resolveCornerStyle(v, p), tween: lerpCornerStyle })
    declare cornerStyle: RectCornerStyle;

    constructor(props: NodeConfig<Camera, CameraProps>) {
        super(props);
        this.applyProp("zoom", props.zoom ?? 1, { tween: lerpNumber });
        this.applyProp("origin", props.origin ?? { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", props.heading ?? 0, { tween: lerpNumber });
    }

    // ---- Camera motion helpers --------------------------------------------
    // Mirror the base Node `moveTo`/`rotateTo` family for the camera's own
    // viewport props (`zoom`, `origin`, `heading`).

    /**
     * Animate the magnification factor (`zoom`). Values > 1 zoom in; < 1 zoom out.
     *
     * @example
     * yield* camera.zoomTo(2, 0.5, ease.outCubic);
     */
    *zoomTo(zoom: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ zoom } as Partial<CameraProps>, duration, ease);
    }

    /**
     * Animate the world-space focus point (`origin`) — the point that maps to
     * the centre of the camera viewport.
     *
     * @example
     * yield* camera.originTo({ x: 200, y: -100 }, 0.6, ease.inOutQuad);
     */
    *originTo(origin: Vector2, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ origin } as Partial<CameraProps>, duration, ease);
    }

    /**
     * Animate the view rotation (`heading`) in degrees (clockwise).
     *
     * @example
     * yield* camera.headingTo(45, 0.4);
     */
    *headingTo(heading: number, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ heading } as Partial<CameraProps>, duration, ease);
    }

    // ---- Drawing ----------------------------------------------------------

    protected override shapeGraphics(): Graphics {
        return new Graphics().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    // The card behind the world — the camera's viewport frame. Stroke is
    // deferred to renderStroke so it frames the world (children) and overlay.
    protected renderSelf(draw: RenderContext): void {
        draw.draw(this.shapeGraphics().shadow(this.shadow).fill(this.fill));
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

    // No flex/stack layout — the world (children) is stack-laid-out (centered)
    // by the base Node.layout default, then viewed through the camera.

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
            this.origin,
            this.zoom,
            this.heading,
        );

        for (const child of this._children) child.render(ctx);

        ctx.endCamera();
    }
}
