import type { Passthrough3D } from "./geometry";
import type { Transform3D } from "./transform";

/**
 * A perspective camera — converging rays, so distant things shrink. What you want
 * unless you specifically need the flat look of an orthographic projection.
 *
 * Extends {@link Transform3D}, so placement and aim use the same vocabulary as
 * everything else: `.perspective({ position: [0, 2, 6], lookAt: 0 })`.
 */
export interface PerspectiveCameraData3D extends Transform3D, Passthrough3D {
    type: "perspective";
    /** Vertical field of view in **degrees**. Default 50. */
    fov?: number;
    near?: number;
    far?: number;
    /**
     * Aspect ratio override. Omit to track the node's layout box, which is
     * almost always what you want — otherwise the render is stretched.
     */
    aspect?: number;
    /** Zoom factor applied on top of {@link fov}. */
    zoom?: number;
}

/**
 * An orthographic camera — parallel rays, so size is independent of distance.
 * For isometric views, technical diagrams and 2.5D layouts.
 *
 * {@link frustumHeight} is the ergonomic control: it sets the visible world height
 * and derives the width from the node's aspect ratio. Set the four explicit edges
 * instead only when you need an asymmetric frustum.
 */
export interface OrthographicCameraData3D extends Transform3D, Passthrough3D {
    type: "orthographic";
    /** Visible world-space height; width follows the node's aspect. Default 10. */
    frustumHeight?: number;
    near?: number;
    far?: number;
    /** Explicit frustum edges. Override {@link frustumHeight} when all four are set. */
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    zoom?: number;
}

/** Every camera a scene can be viewed through. Discriminated on `type`. */
export type CameraData3D = PerspectiveCameraData3D | OrthographicCameraData3D;
