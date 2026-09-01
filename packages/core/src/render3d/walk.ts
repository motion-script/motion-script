/**
 * Structural walks over a built {@link Graphics3D} or {@link Scene3D}.
 *
 * A `Graphics3D` is a flat op list with a handful of scene-level descriptors
 * hanging off it, and more than one consumer needs to sweep the same surface for
 * the same thing. {@link forEachTexture3D} is that sweep for textures: asset
 * discovery uses it during precomp to decide what to load, and the renderer uses
 * it at paint time to find the surface textures it has to rasterize first.
 *
 * Keeping it here rather than in either caller is what stops the two from
 * drifting — a texture slot added to a material must be seen by *both*, or a map
 * loads and never draws (or draws and never loads).
 */

import type { Graphics3D } from "./graphics3d";
import { Scene3D } from "./scene3d";
import type { Material3D } from "./material";
import type { Texture3D } from "./texture";

/** Material fields that hold a {@link Texture3D}. */
export const TEXTURE_KEYS: readonly string[] = [
    "map", "alphaMap", "aoMap", "normalMap", "displacementMap", "envMap",
    "lightMap", "emissionMap", "roughnessMap", "metalnessMap", "specularMap",
    "gradientMap", "matcap", "clearcoatMap", "clearcoatNormalMap",
    "clearcoatRoughnessMap", "transmissionMap", "thicknessMap",
];

/**
 * True for a texture descriptor object (vs. a plain uniform value).
 *
 * Structural, because {@link Texture3D} has no `type` discriminant — each member
 * is branded by the presence of its own payload key.
 */
export function isTextureLike(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return "src" in value || "data" in value || "source" in value;
}

/**
 * Visit every {@link Texture3D} a scene references — material map slots, and
 * shader and post-effect uniforms.
 *
 * Visits duplicates; callers dedupe on whatever key they care about. Does **not**
 * cover model/environment resources, which are not textures and go through the
 * backend's own loader — see `track3DResources`.
 */
export function forEachTexture3D(g3: Graphics3D | Scene3D, visit: (texture: Texture3D) => void): void {
    const uniforms = (bag: Record<string, unknown> | undefined): void => {
        if (!bag) return;
        for (const key in bag) {
            const value = bag[key];
            if (typeof value === "string" || isTextureLike(value)) visit(value as Texture3D);
        }
    };

    const material = (value: Material3D | readonly Material3D[] | undefined): void => {
        if (value === undefined) return;
        const list = Array.isArray(value) ? value : [value as Material3D];
        for (const entry of list) {
            const bag = entry as unknown as Record<string, unknown>;
            for (const key of TEXTURE_KEYS) {
                if (bag[key] !== undefined) visit(bag[key] as Texture3D);
            }
            // A shader's uniforms can hold textures too.
            uniforms(bag.uniforms as Record<string, unknown> | undefined);
        }
    };

    for (const op of g3.ops()) {
        switch (op.kind) {
            case "mesh":
            case "points":
            case "line":
            case "instances":
                material(op.material);
                break;
            case "sprite":
                material(op.material);
                break;
            case "model":
                if (op.override) {
                    for (const key in op.override) material(op.override[key]);
                }
                break;
            // push/pop/light reference no textures.
        }
    }

    // Only a whole scene has a post chain; what a single node draws has none.
    // The environment's own panorama is not visited here: it is loaded through
    // the backend's HDR/EXR loader rather than the image pipeline, and
    // `trackEnvironment` is what declares it.
    if (!(g3 instanceof Scene3D)) return;

    for (const effect of g3.postEffects()) {
        uniforms((effect as { uniforms?: Record<string, unknown> }).uniforms);
    }
}
