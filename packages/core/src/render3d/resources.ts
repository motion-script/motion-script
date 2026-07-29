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
export type View3DWarmup = () => Promise<void>;

/**
 * Loads a resource core can't decode itself. `kind` tells the backend which
 * loader to use; the returned {@link Disposer} frees the parsed result when the
 * asset window moves past it.
 */
export type View3DResourceKind = "hdr" | "exr" | "gltf" | "obj" | "cubemap";
export type View3DResourceLoader = (kind: View3DResourceKind, src: string) => Promise<Disposer>;

let warmup: View3DWarmup | null = null;
let resourceLoader: View3DResourceLoader | null = null;

/**
 * Register the 3D runtime loader. Called once by the rendering backend at module
 * load — authors never call this.
 */
export function registerView3DWarmup(fn: View3DWarmup): void {
    warmup = fn;
}

/**
 * Register the loader for resource types core can't decode (HDR/EXR env maps,
 * glTF/OBJ models). Called once by the rendering backend.
 */
export function registerView3DResourceLoader(fn: View3DResourceLoader): void {
    resourceLoader = fn;
}

/**
 * Kick off loading the 3D runtime.
 *
 * `View3D.prepareRender()` calls this, which runs during precomp — *before* any
 * frame is drawn — so by the time the first 3D frame paints the runtime is
 * normally already resident and the render pass stays synchronous. The renderer
 * still has a per-frame fallback for the case where it isn't.
 *
 * @internal
 */
export function warmView3D(): Promise<void> | void {
    return warmup?.();
}

/** The registered resource loader, or `null` when no backend supplied one. @internal */
export function view3DResourceLoader(): View3DResourceLoader | null {
    return resourceLoader;
}

/** True when a backend has registered a 3D runtime. @internal */
export function hasView3DBackend(): boolean {
    return warmup !== null;
}
