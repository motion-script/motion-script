/**
 * `CameraData3D` descriptor → `THREE.Camera`, and the default framing when a scene
 * declares no camera at all.
 *
 * `fov`/near/far/aspect changes cost one projection-matrix rebuild, so they're
 * written only when a value actually differs — a camera whose position animates
 * but whose lens is fixed pays nothing.
 */

import type * as THREE from "three";
import type { Box3, CameraData3D } from "@motion-script/core";
import { resolveCameraPlacement } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { applyTransform } from "./transform";

/** True when `camera` matches the kind `descriptor` asks for. */
export function cameraMatches(three: ThreeModule, camera: THREE.Camera, descriptor: CameraData3D): boolean {
    return descriptor.type === "perspective"
        ? camera instanceof three.PerspectiveCamera
        : camera instanceof three.OrthographicCamera;
}

/** Build a camera for `descriptor`. */
export function createCamera(three: ThreeModule, descriptor: CameraData3D | null): THREE.Camera {
    if (descriptor?.type === "orthographic") return new three.OrthographicCamera();
    return new three.PerspectiveCamera();
}

/**
 * Write `descriptor` onto a live camera and frame it to `width`/`height`.
 *
 * With no descriptor, falls back to a perspective camera pulled back along +Z
 * looking at the origin — enough to see a unit-scale scene, so `g3.box()` alone
 * renders something rather than a black frame.
 *
 * `aspect` always tracks the buffer. It used to be an overridable field whose own
 * documentation said not to set it, and setting it stretched the render.
 */
export function applyCamera(
    three: ThreeModule,
    camera: THREE.Camera,
    descriptor: CameraData3D | null,
    width: number,
    height: number,
    bounds?: Box3 | null,
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

    const clip = clipPlanes(descriptor, bounds);
    let dirty = false;

    if (descriptor.type === "perspective") {
        const perspective = camera as THREE.PerspectiveCamera;
        const fov = descriptor.fov ?? 50;
        const zoom = descriptor.zoom ?? 1;

        if (perspective.fov !== fov) { perspective.fov = fov; dirty = true; }
        if (perspective.near !== clip.near) { perspective.near = clip.near; dirty = true; }
        if (perspective.far !== clip.far) { perspective.far = clip.far; dirty = true; }
        if (perspective.aspect !== aspect) { perspective.aspect = aspect; dirty = true; }
        if (perspective.zoom !== zoom) { perspective.zoom = zoom; dirty = true; }
    } else {
        const ortho = camera as THREE.OrthographicCamera;
        const zoom = descriptor.zoom ?? 1;

        // `frustumHeight` sets the visible world height and the width follows the
        // buffer's aspect, which is the control an author actually wants. An
        // asymmetric frustum is a `params` override rather than four more fields.
        const halfHeight = (descriptor.frustumHeight ?? 10) / 2;
        const left = -halfHeight * aspect;
        const right = halfHeight * aspect;

        if (ortho.left !== left) { ortho.left = left; dirty = true; }
        if (ortho.right !== right) { ortho.right = right; dirty = true; }
        if (ortho.top !== halfHeight) { ortho.top = halfHeight; dirty = true; }
        if (ortho.bottom !== -halfHeight) { ortho.bottom = -halfHeight; dirty = true; }
        if (ortho.near !== clip.near) { ortho.near = clip.near; dirty = true; }
        if (ortho.far !== clip.far) { ortho.far = clip.far; dirty = true; }
        if (ortho.zoom !== zoom) { ortho.zoom = zoom; dirty = true; }
    }

    // Placement resolves the polar form (`target`/`orbit`/`elevation`/`distance`)
    // into a position and an aim, in core, so the editor's picking geometry and
    // the render agree about where the camera is. The rest of the transform —
    // and the parenting that lets a camera ride inside a rig — is unchanged.
    const placement = resolveCameraPlacement(descriptor);
    applyTransform(camera, {
        ...descriptor,
        position: placement.position,
        lookAt: placement.lookAt,
    });

    if (descriptor.params) {
        const target = camera as unknown as Record<string, unknown>;
        for (const key of Object.keys(descriptor.params)) target[key] = descriptor.params[key];
        dirty = true;
    }

    if (dirty) {
        (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
    }
    void three;
}

/**
 * Near and far clip planes — derived from the scene's own extent unless stated.
 *
 * Two numbers nobody wants to think about and that are wrong by default at any
 * scale but one: too near a `far` clips the back of the scene, too far a `near`
 * destroys depth precision and produces z-fighting. The scene knows its own size,
 * so it answers. The ratio is kept under ~10⁵, which is comfortably inside what a
 * 24-bit depth buffer resolves.
 */
function clipPlanes(descriptor: CameraData3D, bounds?: Box3 | null): { near: number; far: number } {
    if (descriptor.near !== undefined && descriptor.far !== undefined) {
        return { near: descriptor.near, far: descriptor.far };
    }

    const span = bounds
        ? Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z,
        )
        : 10;
    const distance = descriptor.distance ?? Math.max(span, 1) * 2;
    const reach = Math.max(span, distance, 1);

    return {
        near: descriptor.near ?? Math.max(0.01, reach / 1000),
        far: descriptor.far ?? reach * 10,
    };
}
