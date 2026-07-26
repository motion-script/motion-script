/**
 * Backend seams for 3D runtime and resource loading.
 *
 * Core describes 3D scenes but cannot load a 3D runtime — `three` lives in the
 * rendering backend, and core must not import it. So core declares the capability
 * here and the backend registers an implementation at module load, the same shape
 * as the other platform seams (`StorageAdapter`, `MasterClock`) and the same
 * "core owns *whether*, backend owns *how*" split as `EffectSurface`.
 *
 * With no backend registered every function here is an inert no-op, which is what
 * keeps core usable headless and in unit tests.
 */

import type { Disposer } from "@/assets/record";

/** Loads the backend's 3D runtime. Idempotent and memoised by the backend. */
export type Scene3DWarmup = () => Promise<void>;

/**
 * Loads a resource core can't decode itself. `kind` tells the backend which
 * loader to use; the returned {@link Disposer} frees the parsed result when the
 * asset window moves past it.
 */
export type Scene3DResourceKind = "hdr" | "exr" | "gltf" | "obj" | "cubemap";
export type Scene3DResourceLoader = (kind: Scene3DResourceKind, src: string) => Promise<Disposer>;

let warmup: Scene3DWarmup | null = null;
let resourceLoader: Scene3DResourceLoader | null = null;

/**
 * Register the 3D runtime loader. Called once by the rendering backend at module
 * load — authors never call this.
 */
export function registerScene3DWarmup(fn: Scene3DWarmup): void {
    warmup = fn;
}

/**
 * Register the loader for resource types core can't decode (HDR/EXR env maps,
 * glTF/OBJ models). Called once by the rendering backend.
 */
export function registerScene3DResourceLoader(fn: Scene3DResourceLoader): void {
    resourceLoader = fn;
}

/**
 * Kick off loading the 3D runtime.
 *
 * `Scene3D.prepareRender()` calls this, which runs during precomp — *before* any
 * frame is drawn — so by the time the first 3D frame paints the runtime is
 * normally already resident and the render pass stays synchronous. The renderer
 * still has a per-frame fallback for the case where it isn't.
 *
 * @internal
 */
export function warmScene3D(): Promise<void> | void {
    return warmup?.();
}

/** The registered resource loader, or `null` when no backend supplied one. @internal */
export function scene3DResourceLoader(): Scene3DResourceLoader | null {
    return resourceLoader;
}

/** True when a backend has registered a 3D runtime. @internal */
export function hasScene3DBackend(): boolean {
    return warmup !== null;
}
