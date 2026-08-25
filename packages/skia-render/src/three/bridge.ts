/**
 * The lazy boundary around three.js.
 *
 * `three` is ~600 KB minified, and most projects are 2D — so it must not land in
 * their bundles. The only references to it anywhere in this package are a
 * **type-only** namespace import (fully erased at compile time) and the single
 * `import("three")` below, which bundlers emit as a separate chunk fetched on
 * first use.
 *
 * The cost of that is an async step in front of an otherwise synchronous render
 * pass, which this module manages:
 *
 *  - {@link loadCanvas3D} is the memoised loader. `Canvas3D.prepareRender()` calls
 *    it through core's warmup seam during **precomp**, before any frame is drawn,
 *    so in practice the runtime is resident before the first 3D frame paints.
 *  - {@link threeModule} is the synchronous accessor the render pass uses. It
 *    returns `null` until the import resolves.
 *  - If a frame does hit a 3D op with the runtime still loading, it registers via
 *    {@link requestCanvas3DWarm} and draws its 2D parts only. The existing
 *    "re-render until warm" loop that `warmPendingVideo` drives (export,
 *    screenshot, seek) then picks it up, so exported frames stay accurate without
 *    any call site learning about 3D.
 *
 * Modelled on `getCanvasKit` (`../getter.ts`) — same memoised-promise shape.
 */

import {
    canvas3DResourceKey,
    parseCanvas3DResourceKey,
    registerCanvas3DResourceLoader,
    registerCanvas3DWarmup,
    type Canvas3DResourceKind,
    type Disposer,
} from "@motion-script/core";

/** three.js instance types. Type-only: this import emits nothing. */
import type * as THREE from "three";

/** The three.js module namespace. Type-only: this import emits nothing. */
export type ThreeModule = typeof import("three");

let mod: ThreeModule | null = null;
let loading: Promise<ThreeModule> | null = null;

/** Node ids whose 3D draw couldn't be satisfied synchronously this frame. */
const pendingNodes = new Set<string>();

/** Parsed resources awaiting a loader that core couldn't route (HDR, glTF). */
const pendingResources = new Map<string, Canvas3DResourceKind>();

/**
 * The three.js module, or `null` before {@link loadCanvas3D} has resolved.
 *
 * Synchronous by necessity: the render pass ends in `surface.flush()` and cannot
 * await. A `null` here means "draw the 2D parts and ask to be re-rendered".
 */
export function threeModule(): ThreeModule | null {
    return mod;
}

/**
 * Load the three.js runtime. Idempotent and memoised — safe to call from a
 * render pass or once per frame.
 */
export function loadCanvas3D(): Promise<void> {
    if (mod) return Promise.resolve();
    loading ??= import("three").then((loaded) => {
        mod = loaded;
        return loaded;
    });
    return loading.then(() => undefined);
}

/**
 * Register that a 3D fill slot's content could not be drawn synchronously, so the
 * caller's re-render loop knows there is warming to do.
 */
export function requestCanvas3DWarm(key: string): void {
    pendingNodes.add(key);
}

/** Register a resource that needs the backend's own loader. */
export function requestCanvas3DResource(key: string, kind: Canvas3DResourceKind): void {
    pendingResources.set(key, kind);
}

/**
 * Drain every pending 3D dependency, and report whether there was any.
 *
 * Drains its *whole* queue in one call rather than one dependency level per
 * outer pass, because every caller's re-render loop is capped at three passes
 * (`exporter.ts`, `screenshot.ts`, `playback-controller.ts`) — a level-per-pass
 * design would silently run out of budget on a scene whose resources are
 * discovered behind the runtime import.
 */
export async function warmPendingCanvas3D(): Promise<boolean> {
    let warmed = false;

    // Bounded: each iteration must strictly reduce the queue or we stop.
    for (let pass = 0; pass < 4; pass++) {
        if (pendingNodes.size === 0 && pendingResources.size === 0) break;

        pendingNodes.clear();
        const resources = [...pendingResources];
        pendingResources.clear();

        await loadCanvas3D();
        if (resources.length > 0) await Promise.all(resources.map(([key]) => loadResource(key)));
        warmed = true;
    }

    return warmed;
}

/** Parsed results of resources core can't decode, keyed as `three:<kind>:<src>`. */
const resourceCache = new Map<string, unknown>();

/** A parsed resource, or `null` if it hasn't been loaded. */
export function canvas3DResource(key: string): unknown {
    return resourceCache.get(key) ?? null;
}

/**
 * Load one queued resource, keyed as core keys it.
 *
 * Only glTF today. The other kinds ({@link Canvas3DResourceKind}: HDR/EXR
 * environments, OBJ, cubemaps) arrive with the phases that introduce them; an
 * unhandled kind leaves its key out of {@link resourceCache}, so a descriptor
 * referencing it renders without that resource rather than stalling the warm
 * loop forever.
 */
async function loadResource(key: string): Promise<void> {
    const parsed = parseCanvas3DResourceKey(key);
    if (parsed?.kind !== "gltf") return;

    const model = await loadGltfModel(parsed.src);
    if (model) resourceCache.set(key, model);
}

/**
 * A glTF/GLB file, parsed once and kept as a master copy.
 *
 * The master is never added to a scene. Every drawn instance is a
 * {@link clone}, which is what lets one file back several `Model3D` nodes
 * without their animations, material overrides or transforms treading on each
 * other — three’s scene graph gives an object exactly one parent, so sharing the
 * loaded graph directly would make the second node steal it from the first.
 */
export interface LoadedModel3D {
    /** The parsed graph. Treat as immutable — clone before touching it. */
    scene: THREE.Object3D;
    /** Baked clips, in file order. Named clips are matched against these. */
    animations: THREE.AnimationClip[];
    /** An independent copy, with skinned meshes rebound to their own skeleton. */
    clone(): THREE.Object3D;
}

/**
 * The parsed model for `src`, or `null` while it is still loading (or if it
 * failed).
 *
 * Synchronous for the same reason {@link threeModule} is: the render pass ends
 * in `surface.flush()` and cannot await. A `null` means “draw nothing here and
 * ask to be re-rendered”, which is what {@link requestCanvas3DResource} is for.
 */
export function canvas3DModel(src: string): LoadedModel3D | null {
    const found = resourceCache.get(canvas3DResourceKey("gltf", src));
    return (found as LoadedModel3D | undefined) ?? null;
}

/**
 * Parse a glTF/GLB file.
 *
 * The loader and the skeleton cloner are imported **here** rather than at module
 * scope for the reason three itself is (see this file’s header): they pull three
 * in behind them, and a 2D project must not pay for that. They are separate
 * chunks a bundler fetches on first use.
 *
 * A failure resolves `null` rather than rejecting. Three things reach this that
 * are outside our control — a URL that 404s, a file whose bytes are not glTF, and
 * a mesh compressed with Draco or KTX2 (whose decoders are separate downloads
 * this does not yet wire up) — and none of them is worth taking the frame down
 * for. An empty slot is the same degradation as a model that has not finished
 * loading, which every caller already handles.
 */
async function loadGltfModel(src: string): Promise<LoadedModel3D | null> {
    try {
        const [, loaders, skeletonUtils] = await Promise.all([
            // Populates `mod`, which the render pass reads synchronously. The two
            // addons below pull three in themselves, but only this sets it.
            loadCanvas3D(),
            import("three/addons/loaders/GLTFLoader.js"),
            import("three/addons/utils/SkeletonUtils.js"),
        ]);

        const gltf = await new loaders.GLTFLoader().loadAsync(src);
        return {
            scene: gltf.scene,
            animations: gltf.animations,
            clone: () => skeletonUtils.clone(gltf.scene),
        };
    } catch {
        return null;
    }
}

/**
 * Free a parsed model’s GPU resources.
 *
 * Textures **are** disposed here, unlike in the reconciler’s `disposeObject`:
 * these were decoded by the glTF loader for this file alone and are not in the
 * texture cache, so nothing else can be holding them.
 */
function disposeModel(model: LoadedModel3D): void {
    model.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (!material) continue;
            for (const value of Object.values(material)) {
                const texture = value as THREE.Texture | null;
                if (texture?.isTexture) texture.dispose();
            }
            material.dispose();
        }
    });
}

/**
 * Hand core the warmup hook so `Canvas3D.prepareRender()` can preload the runtime
 * during precomp. Runs at module load; `../index.ts` imports this module so the
 * registration always happens for a consumer of this package.
 */
export function registerCanvas3DBackend(): void {
    registerCanvas3DWarmup(loadCanvas3D);
    registerCanvas3DResourceLoader(async (kind, src): Promise<Disposer> => {
        const key = canvas3DResourceKey(kind, src);
        await loadResource(key);

        // Resolving a no-op disposer for a kind this backend does not load yet
        // (or a file that failed) is the honest answer: nothing was cached, so
        // there is nothing for the asset window to evict.
        const model = resourceCache.get(key) as LoadedModel3D | undefined;
        if (!model) return () => {};

        return () => {
            resourceCache.delete(key);
            disposeModel(model);
        };
    });
}

/**
 * Reset module state. Test-only — the memoised module is process-wide, so a suite
 * exercising the cold-import path needs a way back to the initial state.
 */
export function __resetCanvas3DBridgeForTests(): void {
    mod = null;
    loading = null;
    pendingNodes.clear();
    pendingResources.clear();
    resourceCache.clear();
}
