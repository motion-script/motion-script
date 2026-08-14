import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { lerpNumber } from "@/tween/lerp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";


import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { cornerRadiusProperty, cornerStyleProperty } from "@/attributes/properties/typed";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { CameraScope, NodeConfig } from "../base/node";

export interface CameraProps extends ShapeProps {
    /** Magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /**
     * World-space point that maps to the centre of the camera viewport — what
     * the camera is pointed at. Same name and meaning as
     * `Graphics3D.perspective({ lookAt })`, so a 2D and a 3D camera are aimed
     * with the same word.
     */
    lookAt: Vector2;
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
 * Unlike `Rect` it runs no flex/freeform layout — children are laid out freeform-style
 * (centered) and then viewed through the camera transform.
 */
export class Camera extends ShapeNode<CameraProps> {

    /** Magnification factor (default: 1). */
    declare zoom: number;
    /** World-space point the viewport centres on (default: {x:0, y:0}). */
    declare lookAt: Vector2;
    /** View rotation in degrees (default: 0). */
    declare heading: number;

    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    constructor(props: NodeConfig<Camera, CameraProps>) {
        super(props);
        this.applyProp("zoom", props.zoom ?? 1, { tween: lerpNumber });
        this.applyProp("lookAt", props.lookAt ?? { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", props.heading ?? 0, { tween: lerpNumber });
    }

    // ---- Camera motion helpers --------------------------------------------
    // Mirror the base Node `moveTo`/`rotateTo` family for the camera's own
    // viewport props (`zoom`, `lookAt`, `heading`).

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
     * Pan the camera — animate `lookAt`, the world-space point that maps to the
     * centre of the viewport.
     *
     * @example
     * yield* camera.panTo({ x: 200, y: -100 }, 0.6, ease.inOutQuad);
     */
    *panTo(lookAt: Vector2, duration: number, ease?: EasingFunction): FrameGenerator {
        return yield* this.to({ lookAt } as Partial<CameraProps>, duration, ease);
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

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // ---- Layout -----------------------------------------------------------

    // No flex/freeform layout — the world (children) is freeform-laid-out (centered)
    // by the base Node.layout default, then viewed through the camera.

    // No custom measure — the base `Node.measure` hugs children stack-style on a
    // `"hug"` axis, which is exactly the camera's convention (its world is
    // centered inside the viewport box). So a bare `<Camera>` sizes itself to its
    // world, and an explicit `width`/`height`/`'fill'` still resolves as given.

    // ---- Rendering --------------------------------------------------------

    // Always non-null: unlike RootNode there is no at-rest fast path below, so
    // the camera scope (and its viewport clip) is pushed on every frame even when
    // the transform itself is the identity.
    override _cameraScope(): CameraScope {
        return { lookAt: this.lookAt, zoom: this.zoom, heading: this.heading };
    }

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
            this.lookAt,
            this.zoom,
            this.heading,
        );

        for (const child of this._children) child.render(ctx);

        ctx.endCamera();
    }
}
