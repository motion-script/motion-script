import { RenderContext } from "@/render/render-context";
import { lerpNumber } from "@/tween/lerp";


import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { Node, NodeConfig, NodeProps } from "./node";

export interface CameraProps extends NodeProps {
    /** Magnification factor. Values > 1 zoom in; < 1 zoom out. */
    zoom: number;
    /** World-space point that maps to the centre of the camera viewport. */
    centerOn: Vector2;
    /** Rotation of the camera view in degrees (clockwise). */
    heading: number;
}

/**
 * Camera node — renders its children through a viewport transform defined by
 * `zoom`, `centerOn`, and `heading`. The camera's own layout rect determines
 * the viewport bounds on screen.
 */
export class Camera extends Node<CameraProps> {

    /** Magnification factor (default: 1). */
    declare zoom: number;
    /** World-space focus point (default: {x:0, y:0}). */
    declare centerOn: Vector2;
    /** View rotation in degrees (default: 0). */
    declare heading: number;

    constructor(props: NodeConfig<Camera, CameraProps>) {
        super(props);
        this.applyProp("zoom", props.zoom ?? 1, { tween: lerpNumber });
        this.applyProp("centerOn", props.centerOn ?? { x: 0, y: 0 }, { tween: lerpVector2 });
        this.applyProp("heading", props.heading ?? 0, { tween: lerpNumber });
    }

    onRender(ctx: RenderContext): void {
        // Apply the node's own transform (position, scale, rotate, opacity, effects).
        // Children are rendered inside the camera scope below, not by the base.
        this.applyTransform(ctx);

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
