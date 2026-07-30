/**
 * `Camera3D` descriptor → `THREE.Camera`, and the default framing when a scene
 * declares no camera at all.
 *
 * `fov`/`near`/`far`/aspect changes cost one projection-matrix rebuild, so they're
 * written only when a value actually differs — a camera whose position animates
 * but whose lens is fixed pays nothing.
 */

import type * as THREE from "three";
import type { Camera3D } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { applyTransform } from "./transform";

/** True when `camera` matches the kind `descriptor` asks for. */
export function cameraMatches(three: ThreeModule, camera: THREE.Camera, descriptor: Camera3D): boolean {
    return descriptor.type === "perspective"
        ? camera instanceof three.PerspectiveCamera
        : camera instanceof three.OrthographicCamera;
}

/** Build a camera for `descriptor`. */
export function createCamera(three: ThreeModule, descriptor: Camera3D | null): THREE.Camera {
    if (descriptor?.type === "orthographic") return new three.OrthographicCamera();
    return new three.PerspectiveCamera();
}

/**
 * Write `descriptor` onto a live camera and frame it to `width`/`height`.
 *
 * With no descriptor, falls back to a perspective camera pulled back along +Z
 * looking at the origin — enough to see a unit-scale scene, so
 * `g.box()` alone renders something rather than a black frame.
 */
export function applyCamera(
    three: ThreeModule,
    camera: THREE.Camera,
    descriptor: Camera3D | null,
    width: number,
    height: number,
): void {
    const aspect = height > 0 ? width / height : 1;

    if (!descriptor) {
        const perspective = camera as THREE.PerspectiveCamera;
        perspective.fov = 50;
        perspective.near = 0.1;
        perspective.far = 1000;
        if (perspective.aspect !== aspect) perspective.aspect = aspect;
        perspective.position.set(0, 0, 5);
        perspective.lookAt(0, 0, 0);
        perspective.updateProjectionMatrix();
        return;
    }

    let dirty = false;

    if (descriptor.type === "perspective") {
        const perspective = camera as THREE.PerspectiveCamera;
        const fov = descriptor.fov ?? 50;
        const near = descriptor.near ?? 0.1;
        const far = descriptor.far ?? 1000;
        const wanted = descriptor.aspect ?? aspect;
        const zoom = descriptor.zoom ?? 1;

        if (perspective.fov !== fov) { perspective.fov = fov; dirty = true; }
        if (perspective.near !== near) { perspective.near = near; dirty = true; }
        if (perspective.far !== far) { perspective.far = far; dirty = true; }
        if (perspective.aspect !== wanted) { perspective.aspect = wanted; dirty = true; }
        if (perspective.zoom !== zoom) { perspective.zoom = zoom; dirty = true; }
    } else {
        const ortho = camera as THREE.OrthographicCamera;
        const near = descriptor.near ?? 0.1;
        const far = descriptor.far ?? 1000;
        const zoom = descriptor.zoom ?? 1;

        // An explicit four-edge frustum wins; otherwise `frustumHeight` sets the
        // visible world height and the width follows the node's aspect, which is
        // the control an author actually wants.
        const explicit = descriptor.left !== undefined && descriptor.right !== undefined
            && descriptor.top !== undefined && descriptor.bottom !== undefined;

        const halfHeight = (descriptor.frustumHeight ?? 10) / 2;
        const left = explicit ? descriptor.left! : -halfHeight * aspect;
        const right = explicit ? descriptor.right! : halfHeight * aspect;
        const top = explicit ? descriptor.top! : halfHeight;
        const bottom = explicit ? descriptor.bottom! : -halfHeight;

        if (ortho.left !== left) { ortho.left = left; dirty = true; }
        if (ortho.right !== right) { ortho.right = right; dirty = true; }
        if (ortho.top !== top) { ortho.top = top; dirty = true; }
        if (ortho.bottom !== bottom) { ortho.bottom = bottom; dirty = true; }
        if (ortho.near !== near) { ortho.near = near; dirty = true; }
        if (ortho.far !== far) { ortho.far = far; dirty = true; }
        if (ortho.zoom !== zoom) { ortho.zoom = zoom; dirty = true; }
    }

    // A camera is placed with the same Transform3D vocabulary as anything else, so
    // `lookAt` works uniformly. Free — no projection rebuild.
    applyTransform(camera, descriptor);

    if (dirty) {
        (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
    }
    void three;
}
