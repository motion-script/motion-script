/**
 * Scene-level settings — fog, background, environment.
 *
 * These are singletons on the scene rather than ops, so there is no keying or
 * ordering to worry about: each frame writes the current value, and a `null`
 * descriptor clears it.
 */

import type * as THREE from "three";
import type { BackgroundData3D, EnvironmentData3D, FogData3D } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { makeColor, writeColor } from "./constants";
import type { TextureResolver } from "./texture";

/** Apply (or clear) depth fog, reusing the existing fog object where possible. */
export function applyFog(three: ThreeModule, scene: THREE.Scene, descriptor: FogData3D | null): void {
    if (!descriptor) {
        scene.fog = null;
        return;
    }

    if (descriptor.type === "exponential") {
        const density = descriptor.density ?? 0.02;
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
 * Apply the background.
 *
 * `null` and `{ type: "transparent" }` both leave `scene.background` unset, which
 * with the renderer's transparent clear is what lets the 2D scene behind the node
 * show through — the default, and the whole point of compositing 3D into 2D.
 */
export function applyBackground(
    three: ThreeModule,
    scene: THREE.Scene,
    descriptor: BackgroundData3D | null,
    textures: TextureResolver,
): void {
    if (descriptor === null) {
        scene.background = null;
        return;
    }

    // A bare Color (string or normalized tuple) is sugar for a solid clear.
    if (typeof descriptor === "string" || Array.isArray(descriptor)) {
        setBackgroundColor(three, scene, descriptor as never);
        return;
    }

    const value = descriptor as Exclude<BackgroundData3D, string | readonly number[]>;
    switch (value.type) {
        case "transparent":
            scene.background = null;
            break;

        case "color":
            setBackgroundColor(three, scene, value.color);
            break;

        case "texture": {
            const texture = textures.resolve(value.texture, "srgb");
            scene.background = texture ?? null;
            break;
        }

        case "equirect": {
            const texture = textures.resolve(value.texture, "srgb");
            if (texture) {
                texture.mapping = three.EquirectangularReflectionMapping;
                scene.background = texture;
                scene.backgroundBlurriness = value.blurriness ?? 0;
                scene.backgroundIntensity = value.intensity ?? 1;
            } else {
                scene.background = null;
            }
            break;
        }

        case "cubemap": {
            const faces = value.faces.map((face) => textures.resolve(face, "srgb"));
            if (faces.every((face) => face !== null)) {
                const cube = new three.CubeTexture(faces.map((f) => f!.image));
                cube.needsUpdate = true;
                scene.background = cube;
            } else {
                scene.background = null;
            }
            break;
        }
    }
}

function setBackgroundColor(three: ThreeModule, scene: THREE.Scene, color: Parameters<typeof makeColor>[1]): void {
    if (scene.background instanceof three.Color) {
        writeColor(three, scene.background, color);
    } else {
        scene.background = makeColor(three, color);
    }
}

/**
 * Apply image-based lighting.
 *
 * Only `{ type: "room" }` is wired up for now: it is generated procedurally, so it
 * needs no asset and gives metals something to reflect immediately (without an
 * environment, a `metalness: 1` surface renders black). Equirect and cubemap
 * environments need HDR/EXR decoding, which arrives with the resource-loader
 * phase; until then they leave the environment unset rather than failing the frame.
 */
export function applyEnvironment(
    three: ThreeModule,
    scene: THREE.Scene,
    descriptor: EnvironmentData3D | null,
    renderer: THREE.WebGLRenderer | null,
): void {
    if (!descriptor || descriptor.type !== "room" || !renderer) {
        if (!descriptor) {
            scene.environment?.dispose();
            scene.environment = null;
        }
        return;
    }

    // Generating a PMREM is expensive, so build it once and keep it. `userData` is
    // the natural place to stash it — it rides along with the scene we own.
    const cached = scene.userData.__roomEnvironment as THREE.Texture | undefined;
    if (cached) {
        scene.environment = cached;
        scene.environmentIntensity = descriptor.intensity ?? 1;
        return;
    }

    const generator = new three.PMREMGenerator(renderer);
    // A neutral grey studio: enough directional variation to read as a real
    // environment without tinting the scene.
    const environmentScene = new three.Scene();
    environmentScene.background = new three.Color(0xbbbbbb);
    const target = generator.fromScene(environmentScene, 0.04);
    generator.dispose();

    scene.userData.__roomEnvironment = target.texture;
    scene.environment = target.texture;
    scene.environmentIntensity = descriptor.intensity ?? 1;
}
