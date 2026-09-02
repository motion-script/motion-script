import type { Passthrough3D } from "./geometry";
import type { Transform3D } from "./transform";
import { resolveVector3, type Vector3, type Vector3Input } from "./vector3";

/**
 * What every camera has, whatever it projects with.
 *
 * A camera can be placed two ways and they are not redundant. The
 * {@link Transform3D} half — `position` plus `lookAt` — is right when the shot is
 * pinned to something, and it is what a camera inside a moving rig uses. The
 * polar half — {@link target}, {@link orbit}, {@link elevation},
 * {@link distance} — is right when the shot is *about* the subject, which is
 * most of the time, and it is the only one of the two that animates cleanly:
 *
 *   cam().to({ orbit: 160, elevation: 30 }, 4);
 *
 * Writing that same move through `position` means composing sines by hand every
 * frame, which is what every scene did before this existed.
 *
 * Setting any polar field derives `position` and `lookAt`, so the two halves are
 * never in force at once. See {@link resolveCameraPlacement}.
 */
export interface CameraCommon3D extends Transform3D, Passthrough3D {
    /** The point the camera looks at, and orbits around. Default origin. */
    target?: Vector3Input;
    /** Azimuth around {@link target}, in **degrees**. 0 looks down −Z. */
    orbit?: number;
    /** Angle above the horizon, in **degrees**. Clamped just short of vertical. */
    elevation?: number;
    /** Distance from {@link target}. */
    distance?: number;

    /**
     * Near and far clip planes.
     *
     * Both are derived from the scene's own bounds when omitted, which is right
     * far more often than any constant: too near a `far` clips the back of the
     * scene, too far a `near` destroys depth precision. Set them only to override.
     */
    near?: number;
    far?: number;
    /** Zoom factor applied on top of the projection. */
    zoom?: number;
}

/**
 * A perspective camera — converging rays, so distant things shrink. What you want
 * unless you specifically need the flat look of an orthographic projection.
 */
export interface PerspectiveCameraData3D extends CameraCommon3D {
    type: "perspective";
    /** Vertical field of view in **degrees**. Default 50. */
    fov?: number;
}

/**
 * An orthographic camera — parallel rays, so size is independent of distance.
 * For isometric views, technical diagrams and 2.5D layouts.
 *
 * {@link frustumHeight} sets the visible world height and derives the width from
 * the node's aspect ratio. An asymmetric frustum is a `params` override rather
 * than four more fields, because four explicit edges is a projection-matrix
 * feature rather than a framing one.
 */
export interface OrthographicCameraData3D extends CameraCommon3D {
    type: "orthographic";
    /** Visible world-space height; width follows the node's aspect. Default 10. */
    frustumHeight?: number;
}

/** Every camera a scene can be viewed through. Discriminated on `type`. */
export type CameraData3D = PerspectiveCameraData3D | OrthographicCameraData3D;

/**
 * True when the camera is placed polar-ly.
 *
 * `target` is deliberately not part of this. It answers "what am I looking at",
 * which is meaningful on its own — it is `lookAt` under a name that reads right
 * beside `orbit` — and only becomes a *placement* once one of the three fields
 * that orbit around it is set. Including it here would make every camera polar
 * the moment it named a subject, silently discarding its `position`.
 */
export function isOrbitCamera3D(camera: CameraData3D): boolean {
    return camera.orbit !== undefined
        || camera.elevation !== undefined
        || camera.distance !== undefined;
}

/**
 * A camera's effective position and aim.
 *
 * One definition, shared by the renderer and by the editor's picking geometry —
 * two places computing "where is the camera" from the same descriptor is two
 * chances to disagree about what the author sees, and a gizmo drawn against a
 * camera nobody renders is worse than no gizmo.
 *
 * The polar fields win over `position`/`lookAt` when any of them is set, so the
 * two placements can never both be half-applied.
 */
export function resolveCameraPlacement(camera: CameraData3D): {
    position: Vector3;
    lookAt: Vector3 | undefined;
} {
    const target = resolveVector3(camera.target ?? 0);

    if (!isOrbitCamera3D(camera)) {
        // `target` is the subject either way, so a camera placed by `position`
        // still aims at it — which is what makes `target` one idea rather than a
        // polar-only field with `lookAt` as its non-polar twin.
        const aim = camera.lookAt ?? camera.target;
        return {
            position: resolveVector3(camera.position ?? 0),
            lookAt: aim === undefined ? undefined : resolveVector3(aim),
        };
    }

    const distance = camera.distance ?? 10;
    const azimuth = ((camera.orbit ?? 0) * Math.PI) / 180;
    // Just short of the pole: at exactly ±90° the view direction is parallel to
    // the up vector and the look-at basis is undefined, which reads as the shot
    // snapping to an arbitrary roll on the frame it crosses.
    const elevation = (clamp(camera.elevation ?? 0, -89.9, 89.9) * Math.PI) / 180;

    const horizontal = Math.cos(elevation) * distance;

    return {
        position: {
            x: target.x + Math.sin(azimuth) * horizontal,
            y: target.y + Math.sin(elevation) * distance,
            z: target.z + Math.cos(azimuth) * horizontal,
        },
        lookAt: target,
    };
}

function clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
}
