import config from '~user-project'
import assets from '~asset-manifest'
import { exportScenesAsVideo, exportScreenshot, type FrameSpec, type ScreenshotFormat } from '@motion-script/web'
import { setTheme, type Scene } from '@motion-script/core'

/**
 * Headless export bridge.
 *
 * When the plugin-app is loaded with `?headless` in the URL (see main.tsx), we
 * skip mounting the React player entirely and instead expose a tiny imperative
 * API on `window` that a headless browser driver (the `@motion-script/cli`
 * package) can call over the Playwright/CDP bridge:
 *
 *   - `listScenes()`  → the scene names in project order
 *   - `export(opts)`  → render selected scenes to MP4 and return the bytes
 *
 * It deliberately reuses the *exact* same `exportScenesAsVideo` pipeline,
 * `~user-project` config, and `~asset-manifest` that the interactive player
 * uses, so a CLI export is byte-for-byte the same render the user previews —
 * no duplicated build/render config to drift out of sync.
 */

export type HeadlessExportOptions = {
    /** Scene names to export, in the order given. Empty/omitted → all scenes. */
    sceneNames?: string[];
    /** When true, export each scene to its own file; otherwise concatenate. */
    split?: boolean;
    /** Resolution multiplier applied to the project viewport (default 1). */
    scale?: number;
};

export type HeadlessScreenshotOptions = {
    /** Scene names whose concatenated timeline the frame is taken from. Empty/omitted → all scenes. */
    sceneNames?: string[];
    /** Which frame to capture: a global frame index, or the first/last frame. */
    frame: FrameSpec;
    /** Resolution multiplier applied to the project viewport (default 1). */
    scale?: number;
    /** Image format (default "png"). */
    format?: ScreenshotFormat;
};

export type HeadlessScreenshotResult = {
    /** The actual global frame captured (after clamping to the valid range). */
    frame: number;
    /** Total frames in the timeline, so the CLI can validate/report. */
    totalFrames: number;
    /** Encoded image bytes, base64-encoded for the Playwright bridge. */
    base64: string;
};

export type HeadlessBridge = {
    /** The project name from `createProject({ name })`, used for output filenames. */
    readonly projectName: string;
    /** The project frame rate from the config, used to convert a `<time>` spec to a frame. */
    readonly fps: number;
    listScenes(): string[];
    /**
     * Render the selected scenes. Each finished clip is streamed out via the
     * `__motionScriptFileReady` sink (see below) the moment its encode
     * completes — so in `--split` mode the CLI can write each scene's file as
     * that scene finishes, rather than waiting for the whole batch. Resolves
     * once all clips are done.
     */
    export(options: HeadlessExportOptions): Promise<void>;
    /**
     * Render a single frame of the selected scenes' timeline to an image and
     * return its bytes (base64-encoded for the bridge), along with the actual
     * frame captured and the timeline's total frame count. Reuses the same
     * render pipeline as `export`, so the still matches the video frame-for-frame.
     */
    screenshot(options: HeadlessScreenshotOptions): Promise<HeadlessScreenshotResult>;
};

declare global {
    interface Window {
        __motionScript?: HeadlessBridge;
        /** Progress sink the CLI overrides to report per-clip progress (keyed by label). */
        __motionScriptProgress?: (label: string, progress: number) => void;
        /**
         * Per-clip output sink the CLI (driver) overrides. Called once per
         * finished clip with the scene name (`null` for a multi-scene combined
         * clip) and the MP4 bytes base64-encoded. Streaming here is what lets
         * split exports land on disk incrementally. Playwright's exposed
         * functions return a promise; the bridge awaits it so the clip is
         * delivered to Node before the next render starts / export() resolves.
         */
        __motionScriptFileReady?: (scene: string | null, base64: string) => Promise<void>;
    }
}

/**
 * base64-encode bytes for transport over the Playwright bridge (which can't
 * round-trip a `Uint8Array`). Chunked to stay under the `apply()` arg-count
 * limit on large buffers.
 */
function toBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/** Resolve requested scene names to actual Scene objects, preserving request order. */
function selectScenes(names: string[] | undefined): Scene[] {
    const all = config.scenes;
    if (!names || names.length === 0) return all;

    const byName = new Map<string, Scene>(all.map(s => [s.name, s]));
    const selected: Scene[] = [];
    const missing: string[] = [];
    for (const name of names) {
        const scene = byName.get(name);
        if (scene) selected.push(scene);
        else missing.push(name);
    }
    if (missing.length > 0) {
        throw new Error(
            `Unknown scene(s): ${missing.join(', ')}. ` +
            `Available: ${all.map(s => s.name).join(', ') || '(none)'}`,
        );
    }
    return selected;
}

function reportProgress(file: string, progress: number): void {
    window.__motionScriptProgress?.(file, progress);
}

/**
 * Stream one finished clip (base64 MP4) back to the CLI for immediate write.
 * Awaits the exposed-function round-trip so the bytes reach Node before the
 * next scene renders (and before the bridge's export() resolves), so no clip
 * is dropped at the tail.
 */
async function emitFile(scene: string | null, bytes: Uint8Array): Promise<void> {
    await window.__motionScriptFileReady?.(scene, toBase64(bytes));
}

export function installHeadlessBridge(): void {
    const bridge: HeadlessBridge = {
        projectName: config.name,
        fps: config.fps,

        listScenes() {
            return config.scenes.map(s => s.name);
        },

        async export(options) {
            const { split = false, scale = 1 } = options;
            const scenes = selectScenes(options.sceneNames);
            if (scenes.length === 0) {
                throw new Error('No scenes to export.');
            }

            // Register the project's named theme colors into the global color
            // map before rendering, exactly as the live player does (see
            // @motion-script/react scene.tsx). Without this, color tokens like
            // `bg`/`card` from the project config resolve to nothing during a
            // headless export and scenes render with wrong/default fills.
            setTheme(config.theme);

            const common = {
                viewport: config.viewport,
                fps: config.fps,
                scale,
                manifest: assets,
                wasmUrl: '/canvaskit.wasm',
                returnBytes: true as const,
            };

            if (split) {
                // Emit each scene's clip the instant its encode finishes, so the
                // CLI writes it to disk immediately rather than after the batch.
                for (const scene of scenes) {
                    const bytes = await exportScenesAsVideo({
                        ...common,
                        scenes: [scene],
                        onProgress: p => reportProgress(scene.name, p),
                    });
                    await emitFile(scene.name, bytes as Uint8Array);
                }
                return;
            }

            // Combined: concatenate all selected scenes into a single video.
            // A single-scene combined export is still "one scene", so name it
            // after that scene (scene !== null); only a genuine multi-scene mux
            // falls back to the project name (scene === null).
            const single = scenes.length === 1 ? scenes[0].name : null;
            const label = single ?? config.name;
            const bytes = await exportScenesAsVideo({
                ...common,
                scenes,
                onProgress: p => reportProgress(label, p),
            });
            await emitFile(single, bytes as Uint8Array);
        },

        async screenshot(options) {
            const { frame, scale = 1, format = 'png' } = options;
            const scenes = selectScenes(options.sceneNames);
            if (scenes.length === 0) {
                throw new Error('No scenes to screenshot.');
            }

            // Same theme setup as export() — without it, theme color tokens
            // resolve to nothing and the still renders with wrong fills.
            setTheme(config.theme);

            const result = await exportScreenshot({
                scenes,
                viewport: config.viewport,
                fps: config.fps,
                scale,
                manifest: assets,
                wasmUrl: '/canvaskit.wasm',
                frame,
                format,
            });

            return {
                frame: result.frame,
                totalFrames: result.totalFrames,
                base64: toBase64(result.bytes),
            };
        },
    };

    window.__motionScript = bridge;

    // Signal readiness to the driver, which waits on this attribute before
    // calling into the bridge (the bridge is installed asynchronously after
    // the dynamic import resolves).
    document.documentElement.setAttribute('data-motion-script-headless', 'ready');
}
