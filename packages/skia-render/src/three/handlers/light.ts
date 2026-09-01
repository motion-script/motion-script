/**
 * `LightData3D` descriptor → `THREE.Light`.
 *
 * Almost everything on a light is a free in-place write (colour, intensity, cone
 * angle, falloff), so {@link applyLight} runs every frame and lights are only
 * rebuilt when their `type` changes. The exception is shadow *enabling*, which
 * recompiles every material the light touches — so it's part of the signature.
 */

import type * as THREE from "three";
import type { Box3, LightData3D, ShadowOptions3D, Vector3Input } from "@motion-script/core";
import { resolveShadowOptions3D, resolveVector3 } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { deg, writeColor } from "./constants";

/**
 * Point and spot lights measured on a directional light's scale.
 *
 * three switched these to physical units: a directional light's `intensity` is
 * illuminance (lux) while a point or spot light's is luminous intensity
 * (candela), so the same number means very different things and scenes ended up
 * written with `2.4` on one light beside `40` on another. Multiplying by the
 * steradians of a full sphere puts them on one perceptual scale where 1 is a
 * normal light — a convenience, not a photometric claim.
 */
const OMNI_INTENSITY_SCALE = 4 * Math.PI;

/** Build a light for `descriptor`. */
export function createLight(three: ThreeModule, descriptor: LightData3D): THREE.Light {
    switch (descriptor.type) {
        case "ambient": return new three.AmbientLight();
        case "hemisphere": return new three.HemisphereLight();
        case "directional": return new three.DirectionalLight();
        case "point": return new three.PointLight();
        case "spot": return new three.SpotLight();
        case "area": return new three.RectAreaLight();
        default: return new three.AmbientLight();
    }
}

/**
 * Write `descriptor` onto a live light.
 *
 * Everything but the shadow, which is {@link applyLightShadow} and runs later:
 * a directional light's frustum is sized from the scene's own bounds, and nothing
 * knows those until every object has been attached.
 */
export function applyLight(
    three: ThreeModule,
    light: THREE.Light,
    descriptor: LightData3D,
): void {
    const bag = descriptor as unknown as Record<string, unknown>;

    if (descriptor.type === "hemisphere") {
        const hemi = light as THREE.HemisphereLight;
        if (descriptor.sky !== undefined) writeColor(three, hemi.color, descriptor.sky);
        if (descriptor.ground !== undefined) writeColor(three, hemi.groundColor, descriptor.ground);
    } else if (bag.color !== undefined) {
        writeColor(three, light.color, bag.color as never);
    }

    if (bag.intensity !== undefined) {
        const scale = descriptor.type === "point" || descriptor.type === "spot"
            ? OMNI_INTENSITY_SCALE
            : 1;
        light.intensity = (bag.intensity as number) * scale;
    }

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

    if (descriptor.params) {
        for (const key of Object.keys(descriptor.params)) {
            target[key] = descriptor.params[key];
        }
    }
}

/**
 * Set up the light's shadow map from two knobs and the scene's size.
 *
 * `mapSize` comes from the scene's shadow quality (set on the renderer, read
 * here), and `bias`/`normalBias`/`near`/`far`/`extent` are all derived. `bias`
 * especially: its whole job is to cancel the depth quantisation of the shadow
 * map, which is a function of the frustum's depth range and the map's resolution
 * — so it is computed from exactly those, rather than asked for as a magic
 * negative number that has to be re-found whenever the scene is rescaled.
 */
export function applyLightShadow(
    light: THREE.Light,
    descriptor: LightData3D,
    bounds?: Box3 | null,
): void {
    if (!("shadow" in light) || !light.shadow) return;

    // Absent means *no* shadow here, unlike on a mesh. A mesh defaults to
    // participating because turning shadows on should make them appear without
    // tagging every object; a light defaults to not casting because each one that
    // does is another shadow map — six faces for a point light. The light nodes
    // set `shadow: false` explicitly to say the same thing from the other side.
    const declared = (descriptor as { shadow?: never }).shadow;
    const options = declared === undefined ? null : resolveShadowOptions3D(declared);

    light.castShadow = options !== null;
    if (!options) return;

    const lightShadow = light.shadow as THREE.LightShadow;
    const camera = lightShadow.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;

    // Softness drives the filter radius. `pcfSoft` samples a fixed kernel, so the
    // radius is what actually widens the penumbra.
    lightShadow.radius = 1 + (options.softness ?? 0.5) * 8;

    const extent = options.extent ?? sceneExtent(bounds);
    let cameraChanged = false;

    if (descriptor.type === "directional") {
        if (camera.left !== -extent) {
            camera.left = -extent; camera.right = extent;
            camera.top = extent; camera.bottom = -extent;
            cameraChanged = true;
        }
    }

    // Clip planes sized to the same extent, with generous slack: the light sits
    // outside the scene looking in, so the far plane has to cover the distance to
    // the far side of it as well as the scene's own depth.
    const near = Math.max(0.05, extent * 0.05);
    const far = Math.max(near + 1, extent * 8);
    if (camera.near !== near) { camera.near = near; cameraChanged = true; }
    if (camera.far !== far) { camera.far = far; cameraChanged = true; }

    if (cameraChanged) camera.updateProjectionMatrix();

    // Depth precision falls off with the frustum's range and rises with the map's
    // resolution; the bias has to cancel exactly that, so it is derived from both.
    const resolution = lightShadow.mapSize.x || 2048;
    lightShadow.bias = -(far - near) / (resolution * 512);
    lightShadow.normalBias = extent * 0.01;

    if (options.params) {
        const bagTarget = lightShadow as unknown as Record<string, unknown>;
        for (const key of Object.keys(options.params)) {
            bagTarget[key] = options.params[key];
        }
    }
}

/** Half-extent of the scene, or a workable default when it has no bounds yet. */
function sceneExtent(bounds?: Box3 | null): number {
    if (!bounds) return 10;
    const span = Math.max(
        bounds.max.x - bounds.min.x,
        bounds.max.y - bounds.min.y,
        bounds.max.z - bounds.min.z,
    );
    return Math.max(1, span * 0.75);
}

/**
 * A structural signature for a light.
 *
 * Only the type and whether it casts a shadow: everything else is a free in-place
 * write. Shadow *presence* is included because turning shadows on for a light
 * recompiles every material it lights; the two knobs inside are not, since both
 * are plain writes on the existing shadow object.
 */
export function lightSignature(descriptor: LightData3D): string {
    const declared = (descriptor as { shadow?: never }).shadow;
    const casts = declared !== undefined && resolveShadowOptions3D(declared) !== null;
    const parts: string[] = [descriptor.type];
    if (casts) parts.push("shadow");
    if (descriptor.params) parts.push(`params=${JSON.stringify(descriptor.params)}`);
    return parts.join("|");
}

/** Re-exported for the reconciler, which decides whether a light needs bounds. */
export type { ShadowOptions3D };
