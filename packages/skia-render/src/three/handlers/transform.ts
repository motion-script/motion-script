/**
 * `Transform3D` descriptor → `THREE.Object3D` placement.
 *
 * This is the hot path: it runs for every object every frame. All of it is plain
 * matrix writes, so it costs nothing — which is exactly why the docs steer authors
 * toward animating `scale` rather than geometry parameters.
 */

import type * as THREE from "three";
import type { Euler3, Transform3D, Vector3Input } from "@motion-script/core";
import { resolveVector3, shadowCasts, shadowReceives } from "@motion-script/core";
import { deg } from "./constants";

/** three's Euler order strings, indexed by core's. */
type ThreeEulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";

/**
 * Write a transform onto `object`. A missing transform resets to identity, so an
 * object that stops specifying a position doesn't keep the old one.
 */
export function applyTransform(object: THREE.Object3D, transform: Transform3D | undefined): void {
    if (!transform) {
        object.position.set(0, 0, 0);
        object.rotation.set(0, 0, 0);
        object.scale.set(1, 1, 1);
        object.visible = true;
        return;
    }

    if (transform.position !== undefined) {
        const p = resolveVector3(transform.position);
        object.position.set(p.x, p.y, p.z);
    } else {
        object.position.set(0, 0, 0);
    }

    if (transform.scale !== undefined) {
        const s = resolveVector3(transform.scale);
        object.scale.set(s.x, s.y, s.z);
    } else {
        object.scale.set(1, 1, 1);
    }

    // Precedence: lookAt > quaternion > rotation. Each is a complete statement
    // about orientation, so the most specific wins rather than being combined.
    if (transform.lookAt !== undefined) {
        // Must be applied after position — lookAt is computed from where the
        // object currently is.
        const at = resolveVector3(transform.lookAt);
        object.lookAt(at.x, at.y, at.z);
    } else if (transform.quaternion !== undefined) {
        const q = transform.quaternion;
        object.quaternion.set(q.x, q.y, q.z, q.w);
    } else if (transform.rotation !== undefined) {
        applyRotation(object, transform.rotation);
    } else {
        object.rotation.set(0, 0, 0);
    }

    object.visible = transform.visible !== false;
    // Both default to *true*, unlike three's own defaults. A scene with shadows
    // enabled and a light casting them rendered nothing at all until every mesh
    // was tagged, which is the trap this inverts; `shadow={false}` opts out.
    object.castShadow = shadowCasts(transform.shadow);
    object.receiveShadow = shadowReceives(transform.shadow);
    if (transform.renderOrder !== undefined) object.renderOrder = transform.renderOrder;
}

/** Core authors Euler rotations in degrees; three wants radians. */
function applyRotation(object: THREE.Object3D, rotation: Vector3Input | Euler3): void {
    const angles = resolveVector3(rotation as Vector3Input);
    const order = (rotation as Euler3)?.order as ThreeEulerOrder | undefined;
    object.rotation.set(deg(angles.x), deg(angles.y), deg(angles.z), order ?? "XYZ");
}
