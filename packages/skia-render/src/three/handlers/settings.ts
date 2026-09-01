/**
 * Scene-level settings — fog and the environment.
 *
 * These are singletons on the scene rather than ops, so there is no keying or
 * ordering to worry about: each frame writes the current value, and a `null`
 * descriptor clears it.
 *
 * There is no background handler, and that is deliberate rather than missing.
 * three's background pass is unaffected by every light in the scene and by fog
 * (fog is applied in the material shader; the background box has none), the
 * renderer clears transparent, and `Canvas3D` already composites its 3D pass over
 * its own 2D fill layers. So a solid colour, a gradient, an image or a video
 * behind a 3D scene is the ordinary 2D fill chain, which does strictly more than
 * `scene.background` could. What genuinely needs the 3D pass is a sky that
 * *reprojects* as the camera turns, and that is part of the environment below —
 * because an HDRI that lights a scene is the same panorama you see behind it.
 */

import type * as THREE from "three";
import { resolveVector3, type EnvironmentData3D, type FogData3D } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { deg, writeColor } from "./constants";

/**
 * Apply (or clear) depth fog, reusing the existing fog object where possible.
 *
 * Which kind it is comes from which fields are set: `density` is
 * exponential-squared, `near`/`far` are linear. There is no discriminant to
 * disagree with the fields.
 */
export function applyFog(three: ThreeModule, scene: THREE.Scene, descriptor: FogData3D | null): void {
    if (!descriptor) {
        scene.fog = null;
        return;
    }

    if (descriptor.density !== undefined) {
        const density = descriptor.density;
        if (scene.fog instanceof three.FogExp2) {
            if (descriptor.color !== undefined) writeColor(three, scene.fog.color, descriptor.color);
            scene.fog.density = density;
            return;
        }
        scene.fog = new three.FogExp2(0x000000, density);
        if (descriptor.color !== undefined) writeColor(three, scene.fog.color, descriptor.color);
        return;
    }

    const near = descriptor.near ?? 1;
    const far = descriptor.far ?? 1000;
    if (scene.fog instanceof three.Fog) {
        if (descriptor.color !== undefined) writeColor(three, scene.fog.color, descriptor.color);
        scene.fog.near = near;
        scene.fog.far = far;
        return;
    }
    scene.fog = new three.Fog(0x000000, near, far);
    if (descriptor.color !== undefined) writeColor(three, scene.fog.color, descriptor.color);
}

/**
 * Apply image-based lighting, and the sky it comes from.
 *
 * `preset: "room"`-style generation is what is wired up: it needs no asset and
 * gives metals something to reflect immediately (without an environment, a
 * `metalness: 1` surface renders black). An equirect or cubemap source needs
 * HDR/EXR decoding, which arrives with the resource-loader phase; until then it
 * leaves the environment unset rather than failing the frame.
 *
 * `background: true` shows the same panorama behind the scene. It is the same
 * texture rather than a second one by construction, which is the point of the two
 * having been merged: as separate nodes it was possible — and common — to light
 * with one HDRI and show another, or to set one and wonder where the other went.
 */
export function applyEnvironment(
    three: ThreeModule,
    scene: THREE.Scene,
    descriptor: EnvironmentData3D | null,
    renderer: THREE.WebGLRenderer | null,
): void {
    if (!descriptor) {
        scene.environment?.dispose();
        scene.environment = null;
        scene.background = null;
        return;
    }

    const texture = resolveEnvironmentTexture(three, scene, descriptor, renderer);
    if (!texture) {
        scene.background = null;
        return;
    }

    scene.environment = texture;
    scene.environmentIntensity = descriptor.intensity ?? 1;

    if (descriptor.rotation !== undefined && "environmentRotation" in scene) {
        const { x, y, z } = resolveVector3(descriptor.rotation);
        const euler = (scene as unknown as { environmentRotation: THREE.Euler }).environmentRotation;
        euler.set(deg(x), deg(y), deg(z));
    }

    if (descriptor.background) {
        scene.background = texture;
        scene.backgroundBlurriness = descriptor.blur ?? 0;
        scene.backgroundIntensity = descriptor.intensity ?? 1;
    } else {
        scene.background = null;
    }
}

/**
 * The environment's texture, generating and caching the built-in studio.
 *
 * Generating a PMREM is expensive, so it is built once and kept. `userData` is
 * the natural place to stash it — it rides along with the scene we own.
 */
function resolveEnvironmentTexture(
    three: ThreeModule,
    scene: THREE.Scene,
    descriptor: EnvironmentData3D,
    renderer: THREE.WebGLRenderer | null,
): THREE.Texture | null {
    // An asset-backed panorama needs the HDR/EXR loader, which is a later phase.
    if (descriptor.preset === undefined || !renderer) return null;

    const cached = scene.userData.__roomEnvironment as THREE.Texture | undefined;
    if (cached) return cached;

    const generator = new three.PMREMGenerator(renderer);
    // A neutral grey studio: enough directional variation to read as a real
    // environment without tinting the scene.
    const environmentScene = new three.Scene();
    environmentScene.background = new three.Color(0xbbbbbb);
    const target = generator.fromScene(environmentScene, 0.04);
    generator.dispose();

    scene.userData.__roomEnvironment = target.texture;
    return target.texture;
}
