// @motion-script/core/src/engine.ts
import CanvasKitInit, { type CanvasKit } from "@motion-script/canvaskit";

let canvasKit: CanvasKit | null = null;
let initPromise: Promise<CanvasKit> | null = null;

// Default to the wasm shipped by @motion-script/canvaskit so consumers don't
// have to configure anything. This MUST be the custom build that matches the
// glue imported above — the stock canvaskit-wasm binary lacks imports our glue
// expects (e.g. `pd`) and fails to link with a LinkError.
const DEFAULT_WASM_URL = new URL(
    "@motion-script/canvaskit/canvaskit.wasm",
    import.meta.url,
).href;

/**
 * Loads and caches the CanvasKit wasm module (memoized — concurrent callers
 * share the same init promise, and once resolved every call returns the same
 * instance). `wasmUrl` defaults to the wasm shipped by `@motion-script/canvaskit`
 * (resolved by the consumer's bundler), so consumers don't have to configure
 * anything; pass a URL to override where the binary is loaded from.
 */
export async function getCanvasKit(wasmUrl: string = DEFAULT_WASM_URL): Promise<CanvasKit> {
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