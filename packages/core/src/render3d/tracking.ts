/**
 * Asset discovery for 3D scenes.
 *
 * Walks a {@link Graphics3D}'s descriptors for the resources it references and
 * registers them with an {@link AssetTracker}, so the ordinary precomp →
 * `AssetManager.loadAt` chain has them decoded and resident *before* the frame
 * that needs them renders. That is what lets the 3D draw stay synchronous.
 *
 * This runs off the very same descriptors the real render consumes — the node
 * builds its `Graphics3D` through one method that both paths call — so what gets
 * loaded cannot drift from what gets drawn.
 */

import type { AssetTracker } from "@/assets/tracker";
import type { Graphics3D } from "./graphics3d";
import type { Geometry3D } from "./geometry";
import type { Material3D } from "./material";
import type { Background3D, Environment3D } from "./scene-settings";
import { type Texture3D, texture3DSource } from "./texture";
import { scene3DResourceLoader, type Scene3DResourceKind } from "./resources";

/** Material fields that hold a {@link Texture3D}. */
const TEXTURE_KEYS: readonly string[] = [
    "map", "alphaMap", "aoMap", "normalMap", "displacementMap", "envMap",
    "lightMap", "emissiveMap", "roughnessMap", "metalnessMap", "specularMap",
    "gradientMap", "matcap", "clearcoatMap", "clearcoatNormalMap",
    "clearcoatRoughnessMap", "transmissionMap", "thicknessMap",
];

/**
 * Register every asset a 3D scene needs.
 *
 * `width`/`height` are the destination size in pixels, used to pick a decode
 * resolution the same way a 2D image fill does — a texture on a small node
 * doesn't need full-resolution pixels.
 */
export function track3DResources(
    graphics: Graphics3D,
    tracker: AssetTracker,
    width: number,
    height: number,
): void {
    const seen = new Set<string>();

    const texture = (value: Texture3D | undefined): void => {
        if (value === undefined) return;
        const src = texture3DSource(value);
        if (src === null || seen.has(src)) return;
        seen.add(src);
        tracker.requestImage(src, width, height);
    };

    const material = (value: Material3D | readonly Material3D[] | undefined): void => {
        if (value === undefined) return;
        const list = Array.isArray(value) ? value : [value as Material3D];
        for (const entry of list) {
            const bag = entry as unknown as Record<string, unknown>;
            for (const key of TEXTURE_KEYS) {
                if (bag[key] !== undefined) texture(bag[key] as Texture3D);
            }
            // A shader's uniforms can hold textures too.
            const uniforms = bag.uniforms as Record<string, unknown> | undefined;
            if (uniforms) {
                for (const key in uniforms) {
                    const value = uniforms[key];
                    if (typeof value === "string" || isTextureLike(value)) {
                        texture(value as Texture3D);
                    }
                }
            }
        }
    };

    const geometry = (value: Geometry3D | undefined): void => {
        if (value === undefined) return;
        if (value.type === "modelGeometry") {
            loader("gltf", value.src, seen, tracker);
        } else if (value.type === "edges" || value.type === "wireframe") {
            geometry(value.source);
        }
    };

    for (const op of graphics.ops()) {
        switch (op.kind) {
            case "mesh":
            case "points":
            case "line":
                geometry(op.geometry);
                material(op.material);
                break;
            case "instances":
                geometry(op.geometry);
                material(op.material);
                break;
            case "sprite":
                material(op.material);
                break;
            case "model":
                loader("gltf", op.src, seen, tracker);
                if (op.override) {
                    for (const key in op.override) material(op.override[key]);
                }
                break;
            // push/pop/light reference no assets.
        }
    }

    trackBackground(graphics.backgroundDescriptor(), texture);
    trackEnvironment(graphics.environmentDescriptor(), seen, tracker);

    for (const effect of graphics.postEffects()) {
        const uniforms = (effect as { uniforms?: Record<string, unknown> }).uniforms;
        if (!uniforms) continue;
        for (const key in uniforms) {
            const value = uniforms[key];
            if (typeof value === "string" || isTextureLike(value)) texture(value as Texture3D);
        }
    }
}

function trackBackground(
    background: Background3D | null,
    texture: (value: Texture3D | undefined) => void,
): void {
    if (background === null || typeof background === "string" || Array.isArray(background)) return;
    const value = background as Exclude<Background3D, string | readonly number[]>;
    switch (value.type) {
        case "texture":
        case "equirect":
            texture(value.texture);
            break;
        case "cubemap":
            for (const face of value.faces) texture(face);
            break;
    }
}

function trackEnvironment(
    environment: Environment3D | null,
    seen: Set<string>,
    tracker: AssetTracker,
): void {
    if (environment === null) return;
    switch (environment.type) {
        case "equirect":
            // .hdr/.exr can't go through the browser's image decoder, so they need
            // the backend's own loader; a plain image extension can use the normal
            // image path.
            loader(hdrKind(environment.src), environment.src, seen, tracker);
            break;
        case "cubemap":
            for (const face of environment.faces) loader(hdrKind(face), face, seen, tracker);
            break;
        // "room" is generated, no asset.
    }
}

function hdrKind(src: string): Scene3DResourceKind {
    const lower = src.toLowerCase();
    if (lower.endsWith(".exr")) return "exr";
    return "hdr";
}

/**
 * Register a resource that needs the backend's own loader (HDR/EXR env maps,
 * glTF/OBJ models). No-op when no backend has registered one, so core stays
 * usable headless.
 */
function loader(
    kind: Scene3DResourceKind,
    src: string,
    seen: Set<string>,
    tracker: AssetTracker,
): void {
    const key = `three:${kind}:${src}`;
    if (seen.has(key)) return;
    seen.add(key);

    const load = scene3DResourceLoader();
    if (!load) return;
    tracker.requestLoader(key, () => load(kind, src));
}

/** True for a texture descriptor object (vs. a plain uniform value). */
function isTextureLike(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return "src" in value || "data" in value || "surface" in value;
}
