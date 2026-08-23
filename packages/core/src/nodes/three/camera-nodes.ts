import { property } from "@/attributes/properties/decorator";
import type { Transform3D } from "@/render3d/transform";
import type { CameraData3D, OrthographicCameraData3D, PerspectiveCameraData3D } from "@/render3d/camera";
import type { RenderContext3D } from "@/render3d/render-context3d";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The camera nodes — where the scene is viewed from.
 *
 * A camera is placed like anything else, with `position` and `lookAt`, and being
 * a node means it can be *parented*: drop one inside a `Group3D` and it is
 * carried by that group, so orbiting the rig orbits the shot.
 *
 *   <PerspectiveCamera3D position={[0, 2, 6]} lookAt={0} fov={45} />
 *
 * A scene with no camera gets a sensible default framing. A scene that declares
 * more than one keeps the last, since there is only ever one view.
 */

/** Params of a camera descriptor, minus its discriminant. */
type ParamsOf<C extends { type: string }> = Omit<C, "type" | keyof Transform3D>;

function cameraFrom(type: CameraData3D["type"], node: object, keys: readonly string[]): CameraData3D {
    const out: Record<string, unknown> = { type };
    for (const key of keys) {
        const value = (node as Record<string, unknown>)[key];
        if (value !== undefined) out[key] = value;
    }
    return out as unknown as CameraData3D;
}

abstract class Camera3DNode<P extends Node3DProps> extends Node3D<P> {
    protected abstract buildCamera(): CameraData3D;

    /**
     * A camera's group stays identity; the camera places itself.
     *
     * three aims a camera's **-Z** at `lookAt` and a plain group's **+Z**, so a
     * camera sitting inside a group that carried its placement would face exactly
     * backwards. Putting the placement on the descriptor hands it to the camera
     * object itself, where `Object3D.lookAt` uses the camera convention — and it
     * is still parent-relative, so a camera inside a moving rig is carried by it.
     */
    protected override groupTransform(): Transform3D {
        return {};
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.camera({ ...this.buildCamera(), ...this.transform3D() } as CameraData3D);
    }
}

// ─── perspective ─────────────────────────────────────────────────────────────

export interface PerspectiveCamera3DProps extends Node3DProps, Partial<ParamsOf<PerspectiveCameraData3D>> { }

const PERSPECTIVE_KEYS = ["fov", "near", "far", "aspect", "zoom"] as const;

/**
 * Vanishing-point projection — the usual choice. `fov` is the vertical field of
 * view in degrees; a smaller one flattens the scene like a long lens.
 */
export class PerspectiveCamera3D<P extends PerspectiveCamera3DProps = PerspectiveCamera3DProps> extends Camera3DNode<P> {
    @property({ default: undefined }) declare fov: number | undefined;
    @property({ default: undefined }) declare near: number | undefined;
    @property({ default: undefined }) declare far: number | undefined;
    @property({ default: undefined }) declare aspect: number | undefined;
    @property({ default: undefined }) declare zoom: number | undefined;

    protected override buildCamera(): CameraData3D {
        return cameraFrom("perspective", this, PERSPECTIVE_KEYS);
    }
}

// ─── orthographic ────────────────────────────────────────────────────────────

export interface OrthographicCamera3DProps extends Node3DProps, Partial<ParamsOf<OrthographicCameraData3D>> { }

const ORTHOGRAPHIC_KEYS = ["frustumHeight", "near", "far", "left", "right", "top", "bottom", "zoom"] as const;

/**
 * Parallel projection — no perspective foreshortening, for isometric looks and
 * technical diagrams. Size the view with `frustumHeight` (the width follows the
 * node's aspect) or pin all four edges explicitly.
 */
export class OrthographicCamera3D<P extends OrthographicCamera3DProps = OrthographicCamera3DProps> extends Camera3DNode<P> {
    @property({ default: undefined }) declare frustumHeight: number | undefined;
    @property({ default: undefined }) declare near: number | undefined;
    @property({ default: undefined }) declare far: number | undefined;
    @property({ default: undefined }) declare left: number | undefined;
    @property({ default: undefined }) declare right: number | undefined;
    @property({ default: undefined }) declare top: number | undefined;
    @property({ default: undefined }) declare bottom: number | undefined;
    @property({ default: undefined }) declare zoom: number | undefined;

    protected override buildCamera(): CameraData3D {
        return cameraFrom("orthographic", this, ORTHOGRAPHIC_KEYS);
    }
}
