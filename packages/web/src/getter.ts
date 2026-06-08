// @motion-script/core/src/engine.ts
import CanvasKitInit, { type CanvasKit } from "@motion-script/canvaskit";

let canvasKit: CanvasKit | null = null;
let initPromise: Promise<CanvasKit> | null = null;

// Default to unpkg so beginners don't have to configure anything
const DEFAULT_CDN = "https://unpkg.com/canvaskit-wasm@latest/bin/canvaskit.wasm";

/**
 * Loads and caches the CanvasKit wasm module (memoized — concurrent callers
 * share the same init promise, and once resolved every call returns the same
 * instance). `wasmUrl` defaults to a CDN so consumers don't have to host the
 * binary themselves; pass a local URL to use the bundled/copied wasm instead.
 */
export async function getCanvasKit(wasmUrl: string = DEFAULT_CDN): Promise<CanvasKit> {
    if (canvasKit) return canvasKit;
    if (initPromise) return initPromise;

    initPromise = CanvasKitInit({
        locateFile: () => wasmUrl,
    }).then((ck) => {
        canvasKit = ck;
        return ck;
    });
    return initPromise;
}