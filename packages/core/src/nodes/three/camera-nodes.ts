import { property } from "@/attributes/properties/decorator";
import type { Transform3D } from "@/render3d/transform";
import type { CameraData3D } from "@/render3d/camera";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Vector3Input } from "@/render3d/vector3";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The camera — where the scene is viewed from.
 *
 * **One node, two projections.** `<Camera3D type="orthographic">` is the flat
 * one; there is no second class, because a perspective and an orthographic
 * camera are one object with a projection setting, which is how every editor
 * presents it and how a scene switching between them has to be written.
 *
 *   <Camera3D target={[0, 0.2, 0]} orbit={-18} elevation={12} distance={13} fov={42} />
 *
 *   yield* cam().to({ orbit: 160, elevation: 30 }, 4, easeInOut("quad"));
 *
 * ── Orbit, not trigonometry ───────────────────────────────────────────────────
 * `target`/`orbit`/`elevation`/`distance` place the camera in polar coordinates
 * around the thing it is looking at, which is what a camera move almost always
 * *is*. Written through `position` the same move is a `Math.sin`/`Math.cos` pair
 * recomputed every frame in a prop binding — which is exactly what every scene
 * did before this existed, and what the template's own `Graph3D` node
 * independently reinvented `orbit`/`elevation`/`zoom` props to avoid.
 *
 * `position` and `lookAt` still work and are right for a shot pinned to
 * something; setting any polar field takes over, so the two can never be half
 * applied. Either way the camera is a node, so parenting it to a moving
 * `Group3D` carries the shot with the rig.
 *
 * ── What is derived ───────────────────────────────────────────────────────────
 * `near`/`far` come from the scene's own bounds unless you set them, and the
 * aspect ratio always tracks the viewport's layout box — it was a prop whose
 * documentation said "don't set this", and setting it stretched the render.
 * An asymmetric orthographic frustum is a `params` override rather than four
 * more fields.
 *
 * A scene with no camera gets a sensible default framing. A scene that declares
 * more than one keeps the last, since there is only ever one view.
 */
export interface Camera3DProps extends Node3DProps {
    /** `"perspective"` (default) or `"orthographic"`. */
    type: CameraData3D["type"];
    /**
     * The point the camera looks at, and orbits around.
     *
     * On its own it is `lookAt` under a name that reads right beside `orbit`;
     * together with any of the three below it is also the centre they turn about.
     */
    target: Vector3Input | undefined;
    /** Azimuth around {@link target}, in **degrees**. */
    orbit: number | undefined;
    /** Angle above the horizon, in **degrees**. */
    elevation: number | undefined;
    /** Distance from {@link target}. */
    distance: number | undefined;
    /** Perspective only: vertical field of view in **degrees**. Default 50. */
    fov: number | undefined;
    /** Orthographic only: visible world height. Default 10. */
    frustumHeight: number | undefined;
    near: number | undefined;
    far: number | undefined;
    zoom: number | undefined;
}

const CAMERA_KEYS = [
    "target", "orbit", "elevation", "distance",
    "fov", "frustumHeight", "near", "far", "zoom",
] as const;

export class Camera3D<P extends Camera3DProps = Camera3DProps> extends Node3D<P> {
    @property({ default: "perspective" }) declare type: CameraData3D["type"];

    @property({ default: undefined }) declare target: Vector3Input | undefined;
    @property({ default: undefined }) declare orbit: number | undefined;
    @property({ default: undefined }) declare elevation: number | undefined;
    @property({ default: undefined }) declare distance: number | undefined;

    @property({ default: undefined }) declare fov: number | undefined;
    @property({ default: undefined }) declare frustumHeight: number | undefined;
    @property({ default: undefined }) declare near: number | undefined;
    @property({ default: undefined }) declare far: number | undefined;
    @property({ default: undefined }) declare zoom: number | undefined;

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

    protected buildCamera(): CameraData3D {
        const out: Record<string, unknown> = { type: this.type };
        for (const key of CAMERA_KEYS) {
            const value = (this as unknown as Record<string, unknown>)[key];
            if (value !== undefined) out[key] = value;
        }
        return out as unknown as CameraData3D;
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.camera({ ...this.transform3D(), ...this.buildCamera() } as CameraData3D);
    }
}
