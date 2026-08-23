import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { CanvasKit } from '@motion-script/canvaskit';
import { EngineError } from './errors.js';

const require = createRequire(import.meta.url);

let cached: CanvasKit | null = null;
let loading: Promise<CanvasKit> | null = null;

/**
 * Load the CanvasKit WASM module in Node.
 *
 * The same custom Skia build the browser uses, initialized against a file path
 * rather than a URL. It must be that build: the stock `canvaskit-wasm` binary
 * lacks imports this glue expects and fails to link.
 *
 * Memoized process-wide — the module is several megabytes of WASM to compile and
 * holds its own heap, so a server with several engines shares one instance. That
 * is safe because CanvasKit is stateless at this level; surfaces, font providers
 * and images are all per-caller objects created from it.
 */
export async function getCanvasKit(): Promise<CanvasKit> {
    if (cached) return cached;
    loading ??= load().then(ck => {
        cached = ck;
        loading = null;
        return ck;
    }).catch((err: unknown) => {
        loading = null;
        throw err;
    });
    return loading;
}

async function load(): Promise<CanvasKit> {
    let glue: string;
    let wasm: string;
    try {
        // Resolve through the package rather than a relative path so this works
        // from an npm install as well as from the monorepo's symlinked workspace.
        glue = require.resolve('@motion-script/canvaskit');
        wasm = path.join(path.dirname(glue), 'canvaskit.wasm');
    } catch (err) {
        throw new EngineError(
            'START_FAILED',
            'Could not resolve @motion-script/canvaskit. It is a dependency of this package — reinstall.',
            { cause: err },
        );
    }

    try {
        const module = await import(pathToFileURL(glue).href) as {
            default: (options: { locateFile(): string }) => Promise<CanvasKit>;
        };
        return await module.default({ locateFile: () => wasm });
    } catch (err) {
        throw new EngineError(
            'START_FAILED',
            'Could not initialize CanvasKit: ' + (err instanceof Error ? err.message : String(err)),
            { cause: err },
        );
    }
}
