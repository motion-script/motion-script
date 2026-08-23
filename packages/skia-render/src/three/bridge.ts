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

import { registerCanvas3DWarmup, type Canvas3DResourceKind } from "@motion-script/core";

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
 * Placeholder for the loader-backed resource types (HDR/EXR environments,
 * glTF/OBJ models). Those arrive with the phases that introduce them; the queue
 * plumbing lives here now so the warm loop's shape doesn't change later.
 */
async function loadResource(key: string): Promise<void> {
    // Intentionally a no-op until the model/environment phases land. The key
    // stays out of `resourceCache`, so a descriptor referencing it renders
    // without that resource rather than stalling the warm loop forever.
    void key;
}

/**
 * Hand core the warmup hook so `Canvas3D.prepareRender()` can preload the runtime
 * during precomp. Runs at module load; `../index.ts` imports this module so the
 * registration always happens for a consumer of this package.
 */
export function registerCanvas3DBackend(): void {
    registerCanvas3DWarmup(loadCanvas3D);
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
