/**
 * Asset discovery for 3D scenes.
 *
 * Walks a {@link Graphics3D}'s or {@link Scene3D}'s descriptors for the resources it references and
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
import { Scene3D } from "./scene3d";
import type { Geometry3D } from "./geometry";
import type { EnvironmentData3D } from "./scene-settings";
import { texture3DSource } from "./texture";
import { canvas3DResourceKey, canvas3DResourceLoader, type Canvas3DResourceKind } from "./resources";
import { forEachTexture3D } from "./walk";

/**
 * Register every asset a 3D scene needs.
 *
 * `width`/`height` are the destination size in pixels, used to pick a decode
 * resolution the same way a 2D image fill does — a texture on a small node
 * doesn't need full-resolution pixels.
 *
 * The texture sweep is {@link forEachTexture3D}, shared with the renderer so the
 * two can't disagree about which slots hold a texture. What stays here is the
 * half that isn't a texture: models and environment maps, which need the
 * backend's own loader rather than the image pipeline.
 */
export function track3DResources(
    g3: Graphics3D | Scene3D,
    tracker: AssetTracker,
    width: number,
    height: number,
): void {
    const seen = new Set<string>();

    forEachTexture3D(g3, (value) => {
        const src = texture3DSource(value);
        if (src === null || seen.has(src)) return;
        seen.add(src);
        tracker.addImage(src, { width, height });
    });

    const geometry = (value: Geometry3D | undefined): void => {
        if (value === undefined) return;
        if (value.type === "modelGeometry") {
            loader("gltf", value.src, seen, tracker);
        } else if (value.type === "edges" || value.type === "wireframe") {
            geometry(value.source);
        }
    };

    for (const op of g3.ops()) {
        switch (op.kind) {
            case "mesh":
            case "points":
            case "line":
            case "instances":
                geometry(op.geometry);
                break;
            case "model":
                loader("gltf", op.src, seen, tracker);
                break;
            // push/pop/light/sprite reference no loader-backed assets.
        }
    }

    if (g3 instanceof Scene3D) trackEnvironment(g3.environmentDescriptor(), seen, tracker);
}

/** @internal */
export function trackEnvironment(
    environment: EnvironmentData3D | null,
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

function hdrKind(src: string): Canvas3DResourceKind {
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
    kind: Canvas3DResourceKind,
    src: string,
    seen: Set<string>,
    tracker: AssetTracker,
): void {
    const key = canvas3DResourceKey(kind, src);
    if (seen.has(key)) return;
    seen.add(key);

    const load = canvas3DResourceLoader();
    if (!load) return;
    tracker.addAsync(key, () => load(kind, src));
}
