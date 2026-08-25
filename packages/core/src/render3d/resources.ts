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
export type Canvas3DWarmup = () => Promise<void>;

/**
 * Loads a resource core can't decode itself. `kind` tells the backend which
 * loader to use; the returned {@link Disposer} frees the parsed result when the
 * asset window moves past it.
 */
export type Canvas3DResourceKind = "hdr" | "exr" | "gltf" | "obj" | "cubemap";
export type Canvas3DResourceLoader = (kind: Canvas3DResourceKind, src: string) => Promise<Disposer>;

/**
 * The cache key a loader-backed resource is tracked and stored under.
 *
 * Stated once here because **two packages have to agree on it and neither owns
 * both ends**: core's `track3DResources` registers the key with the asset
 * tracker, and the backend's loader is what later looks the parsed result up by
 * it. A backend that built the string itself would be one refactor away from
 * caching under a key nothing ever reads — a model that silently never appears,
 * which is precisely the failure this seam exists to make impossible.
 *
 * `src` goes last and unescaped: it is a URL and may hold colons of its own, so
 * a reader has to split on the first two separators and take the remainder
 * whole rather than splitting on every one — see {@link parseCanvas3DResourceKey}.
 */
export function canvas3DResourceKey(kind: Canvas3DResourceKind, src: string): string {
    return `three:${kind}:${src}`;
}

/**
 * The `kind` and `src` a {@link canvas3DResourceKey} was built from, or `null`
 * when the string is not one.
 *
 * The inverse exists because the backend's warm queue holds keys rather than
 * pairs: `warmPendingCanvas3D` has to re-drive whatever is outstanding knowing
 * only what it was handed.
 */
export function parseCanvas3DResourceKey(
    key: string,
): { kind: Canvas3DResourceKind; src: string } | null {
    if (!key.startsWith("three:")) return null;
    const rest = key.slice("three:".length);
    const split = rest.indexOf(":");
    if (split <= 0) return null;
    return {
        kind: rest.slice(0, split) as Canvas3DResourceKind,
        src: rest.slice(split + 1),
    };
}

let warmup: Canvas3DWarmup | null = null;
let resourceLoader: Canvas3DResourceLoader | null = null;

/**
 * Register the 3D runtime loader. Called once by the rendering backend at module
 * load — authors never call this.
 */
export function registerCanvas3DWarmup(fn: Canvas3DWarmup): void {
    warmup = fn;
}

/**
 * Register the loader for resource types core can't decode (HDR/EXR env maps,
 * glTF/OBJ models). Called once by the rendering backend.
 */
export function registerCanvas3DResourceLoader(fn: Canvas3DResourceLoader): void {
    resourceLoader = fn;
}

/**
 * Kick off loading the 3D runtime.
 *
 * `Canvas3D.prepareRender()` calls this, which runs during precomp — *before* any
 * frame is drawn — so by the time the first 3D frame paints the runtime is
 * normally already resident and the render pass stays synchronous. The renderer
 * still has a per-frame fallback for the case where it isn't.
 *
 * @internal
 */
export function warmCanvas3D(): Promise<void> | void {
    return warmup?.();
}

/** The registered resource loader, or `null` when no backend supplied one. @internal */
export function canvas3DResourceLoader(): Canvas3DResourceLoader | null {
    return resourceLoader;
}

/** True when a backend has registered a 3D runtime. @internal */
export function hasCanvas3DBackend(): boolean {
    return warmup !== null;
}
