/**
 * `Light3D` descriptor → `THREE.Light`.
 *
 * Almost everything on a light is a free in-place write (colour, intensity, cone
 * angle, falloff), so {@link applyLight} runs every frame and lights are only
 * rebuilt when their `type` changes. The exception is shadow *enabling*, which
 * recompiles every material the light touches — so it's part of the signature.
 */

import type * as THREE from "three";
import type { Light3D, Vector3Input } from "@motion-script/core";
import { resolveVector3 } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { deg, writeColor } from "./constants";

/** Build a light for `descriptor`. */
export function createLight(three: ThreeModule, descriptor: Light3D): THREE.Light {
    switch (descriptor.type) {
        case "ambient": return new three.AmbientLight();
        case "hemisphere": return new three.HemisphereLight();
        case "directional": return new three.DirectionalLight();
        case "point": return new three.PointLight();
        case "spot": return new three.SpotLight();
        case "rectArea": return new three.RectAreaLight();
        default: return new three.AmbientLight();
    }
}

/** Write `descriptor` onto a live light. */
export function applyLight(
    three: ThreeModule,
    light: THREE.Light,
    descriptor: Light3D,
    structural = false,
): void {
    const bag = descriptor as unknown as Record<string, unknown>;

    if (descriptor.type === "hemisphere") {
        const hemi = light as THREE.HemisphereLight;
        if (descriptor.skyColor !== undefined) writeColor(three, hemi.color, descriptor.skyColor);
        if (descriptor.groundColor !== undefined) writeColor(three, hemi.groundColor, descriptor.groundColor);
    } else if (bag.color !== undefined) {
        writeColor(three, light.color, bag.color as never);
    }

    if (bag.intensity !== undefined) light.intensity = bag.intensity as number;

    const target = light as unknown as Record<string, unknown>;
    if (bag.distance !== undefined) target.distance = bag.distance;
    if (bag.decay !== undefined) target.decay = bag.decay;
    if (bag.penumbra !== undefined) target.penumbra = bag.penumbra;
    // Cone half-angle: core is degrees, three is radians.
    if (bag.angle !== undefined) target.angle = deg(bag.angle as number);
    if (bag.width !== undefined) target.width = bag.width;
    if (bag.height !== undefined) target.height = bag.height;

    // A directional/spot light aims from its position at a target Object3D, which
    // must itself be in the scene graph for its world matrix to update — three
    // parents it under the light so it follows automatically.
    if ("target" in bag && bag.target !== undefined && "target" in light) {
        const aim = resolveVector3(bag.target as Vector3Input);
        const lightTarget = (light as unknown as { target: THREE.Object3D }).target;
        lightTarget.position.set(aim.x, aim.y, aim.z);
        if (!lightTarget.parent) light.add(lightTarget);
        lightTarget.updateMatrixWorld();
    }

    applyShadow(light, descriptor, structural);

    if (descriptor.params) {
        for (const key of Object.keys(descriptor.params)) {
            target[key] = descriptor.params[key];
        }
    }
}

function applyShadow(light: THREE.Light, descriptor: Light3D, structural: boolean): void {
    const shadow = (descriptor as { shadow?: Record<string, unknown> }).shadow;
    if (!shadow || !("shadow" in light) || !light.shadow) return;

    const lightShadow = light.shadow as THREE.LightShadow;

    // Resolution is a render-target allocation — only touch it on a rebuild.
    if (structural && typeof shadow.mapSize === "number") {
        lightShadow.mapSize.set(shadow.mapSize, shadow.mapSize);
        // Force the existing map to be discarded so the new size takes effect.
        lightShadow.map?.dispose();
        lightShadow.map = null as never;
    }

    if (typeof shadow.bias === "number") lightShadow.bias = shadow.bias;
    if (typeof shadow.normalBias === "number") lightShadow.normalBias = shadow.normalBias;
    if (typeof shadow.radius === "number") lightShadow.radius = shadow.radius;

    const camera = lightShadow.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    let cameraChanged = false;
    if (typeof shadow.near === "number" && camera.near !== shadow.near) {
        camera.near = shadow.near; cameraChanged = true;
    }
    if (typeof shadow.far === "number" && camera.far !== shadow.far) {
        camera.far = shadow.far; cameraChanged = true;
    }

    // A directional light's shadow camera is orthographic, so it needs an explicit
    // world-space extent: too large and the shadow is blocky, too small and it
    // clips. Sized to the subject by the author, not inferred.
    if (descriptor.type === "directional" && typeof shadow.extent === "number") {
        const extent = shadow.extent;
        if (camera.left !== -extent) {
            camera.left = -extent; camera.right = extent;
            camera.top = extent; camera.bottom = -extent;
            cameraChanged = true;
        }
    }

    if (cameraChanged) camera.updateProjectionMatrix();
}

/**
 * A structural signature for a light.
 *
 * Only the type and whether shadows are configured: everything else is a free
 * in-place write. Shadow *presence* is included because turning shadows on for a
 * light recompiles every material it lights.
 */
export function lightSignature(descriptor: Light3D): string {
    const shadow = (descriptor as { shadow?: { mapSize?: number } }).shadow;
    const parts: string[] = [descriptor.type];
    if (shadow) parts.push(`shadow=${shadow.mapSize ?? "default"}`);
    if (descriptor.params) parts.push(`params=${JSON.stringify(descriptor.params)}`);
    return parts.join("|");
}
