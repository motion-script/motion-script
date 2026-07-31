import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';

/** How long to wait for the headless bridge to install before giving up. */
const BRIDGE_READY_TIMEOUT_MS = 60_000;

/**
 * Minimal structural shape of Vite's internal dep-optimizer, just the bits
 * warmOptimizer() needs. Vite doesn't export this type from its public entry,
 * and it isn't stable across minors, so we describe only what we read rather
 * than depend on the full interface.
 */
type DepsOptimizerLike = {
    scanProcessing?: Promise<void>;
    metadata?: {
        optimized?: Record<string, { processing?: Promise<void> } | undefined>;
        discovered?: Record<string, { processing?: Promise<void> } | undefined>;
    };
};

/**
 * Ask the OS for a free TCP port by binding to port 0, reading the assigned
 * port, then releasing it. We can't just pass `server.port: 0` to Vite: its
 * config merge drops a literal `0` (treating it as unset) and falls back to the
 * default 5173 — so every headless server would actually bind 5173, colliding
 * with each other (and any real dev server) and desyncing the page's module
 * base from the server, which surfaces as "Failed to fetch dynamically imported
 * module". We resolve a concrete free port here and pin it with strictPort so
 * the bound port and the resolved URL always agree. There's a tiny TOCTOU
 * window between releasing and Vite re-binding, but on an ephemeral port the
 * OS won't hand the same one out again that fast in practice.
 */
function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            if (addr && typeof addr === 'object') {
                const { port } = addr;
                srv.close(() => resolve(port));
            } else {
                srv.close(() => reject(new Error('Could not resolve a free port.')));
            }
        });
    });
}

export type ExportFile = {
    /** The scene name (split or single-scene export) or `null` (multi-scene combined). */
    scene: string | null;
    /** Encoded MP4 bytes. */
    bytes: Uint8Array;
};

export type DriverExportOptions = {
    sceneNames?: string[];
    split?: boolean;
    scale?: number;
    /** Reports per-file progress in [0,1] as the export runs. */
    onProgress?: (file: string, progress: number) => void;
    /**
     * Called once per finished clip, as soon as its encode completes — so split
     * exports can be written to disk incrementally rather than all at the end.
     */
    onFile?: (file: ExportFile) => void;
};

/** Which frame a screenshot addresses: a global index, or the first/last frame. */
export type FrameSpec =
    | { kind: 'frame'; frame: number }
    | { kind: 'first' }
    | { kind: 'last' };

export type DriverScreenshotOptions = {
    sceneNames?: string[];
    frame: FrameSpec;
    scale?: number;
    format?: 'png' | 'jpeg';
};

export type ScreenshotResult = {
    /** The actual global frame captured (after clamping to the valid range). */
    frame: number;
    /** Frames in the measured timeline. Only the real total when `measuredAll`. */
    totalFrames: number;
    /**
     * True when every scene was measured. An early-frame capture stops once the
     * owning scene is measured, leaving `totalFrames` covering only that prefix.
     */
    measuredAll: boolean;
    /** Decoded image bytes. */
    bytes: Uint8Array;
};

/**
 * Drives a Motion Script project headlessly: starts the project's *own* Vite
 * dev server (so the `@motion-script/vite-plugin` resolves the user's scenes,
 * assets, and CanvasKit exactly as the live player does), opens it in a
 * headless Chromium via Playwright, and talks to the `window.__motionScript`
 * bridge the plugin installs in `?headless` mode.
 *
 * One driver instance == one browser + one server. Always {@link close} it.
 */
export class HeadlessDriver {
    private server: ViteDevServer | null = null;
    private browser: Browser | null = null;
    private page: Page | null = null;

    // Bridge callbacks are exposed to the page once in start() (exposeFunction
    // can't be re-registered), then retargeted per export() via these refs.
    private onProgress: ((label: string, progress: number) => void) | null = null;
    private onFile: ((scene: string | null, base64: string) => void) | null = null;

    constructor(private readonly projectRoot: string) {}

    /** Start Vite + Chromium and wait until the headless bridge is installed. */
    async start(): Promise<void> {
        // The vite-plugin reads `process.cwd()` to locate the user's project
        // (entry, project.ts, public/). The CLI is run from the project root,
        // so cwd is already correct — but pin `root` to the project dir too so
        // Vite picks up the project's own vite.config.* (which registers the
        // motionScript plugin).
        // Resolve a concrete free port up front and pin it with strictPort.
        // `server.port: 0` does NOT work here — Vite's config merge discards the
        // 0 and falls back to its default 5173, so we'd never actually get an
        // ephemeral port (see findFreePort).
        const port = await findFreePort();

        this.server = await createServer({
            root: this.projectRoot,
            // Quiet the dev-server banner; export progress is the only output
            // the user cares about.
            logLevel: 'warn',
            server: {
                // Concrete free port (not the project's configured dev port, so we
                // never collide with a player dev server the user has running).
                port,
                // Fail loudly if the port is taken rather than silently bumping to
                // the next one — a silent bump would desync the page's module base
                // from the resolved URL.
                strictPort: true,
                // We drive the page over CDP; never pop a real browser tab.
                open: false,
                hmr: false,
            },
        });
        await this.server.listen();

        // Force dep-optimization to fully complete (bundles committed to disk)
        // BEFORE the browser navigates. Otherwise the very first page load races
        // the optimizer: main.tsx does `await import('./headless.ts')`, whose
        // transitive deps (canvaskit, mathjax, mediabunny, …) get discovered
        // mid-load and trigger a re-optimize + full page reload — but the headless
        // server runs with hmr:false, so that reload signal never reaches the
        // page and the in-flight dynamic import 504s ("Failed to fetch dynamically
        // imported module"). Warming server-side first means the deps are already
        // built when the browser asks for them.
        await this.warmOptimizer();

        const url = this.resolveServerUrl();

        this.browser = await chromium.launch(this.launchOptions());
        this.page = await this.browser.newPage();

        // Surface in-page errors (a scene build throw, a missing asset, a
        // CanvasKit init failure) instead of silently hanging on the ready wait.
        this.page.on('pageerror', err => {
            process.stderr.write(`[browser] ${err.message}\n`);
        });

        // Expose the bridge sinks once (they can't be re-registered). Each
        // export() retargets the refs; the page-side bridge calls these as it
        // reports progress and finishes each clip.
        await this.page.exposeFunction('__motionScriptProgress', (label: string, progress: number) => {
            this.onProgress?.(label, progress);
        });
        await this.page.exposeFunction('__motionScriptFileReady', (scene: string | null, base64: string) => {
            this.onFile?.(scene, base64);
        });

        await this.page.goto(`${url}?headless`, { waitUntil: 'load' });

        // The bridge installs asynchronously (dynamic import in main.tsx), then
        // sets this attribute. Wait for it before calling in.
        await this.page.waitForSelector(
            'html[data-motion-script-headless="ready"]',
            { timeout: BRIDGE_READY_TIMEOUT_MS, state: 'attached' },
        );

        // Verify the bridge exposes the exact shape this driver depends on,
        // rather than matching a hand-maintained version number. The bridge
        // ships in @motion-script/vite-plugin and the driver in the CLI — two
        // independently-installed packages — so a stale plugin can present an
        // older bridge. Checking capabilities (methods/props actually used)
        // catches that with a clear error and needs no number to keep in sync.
        const missing = await this.page.evaluate(() => {
            const b = window.__motionScript;
            if (!b) return 'bridge not installed';
            const required: string[] = [];
            if (typeof b.export !== 'function') required.push('export()');
            if (typeof b.screenshot !== 'function') required.push('screenshot()');
            if (typeof b.listScenes !== 'function') required.push('listScenes()');
            if (typeof b.projectName !== 'string') required.push('projectName');
            if (typeof b.fps !== 'number') required.push('fps');
            return required.length > 0 ? required.join(', ') : null;
        });
        if (missing) {
            throw new Error(
                `Incompatible Motion Script bridge (missing: ${missing}). ` +
                `The installed @motion-script/vite-plugin is likely stale — ` +
                `rebuild it and reinstall the project.`,
            );
        }
    }

    /**
     * Drive Vite's dep-optimizer to completion server-side before the browser
     * loads the page. We transform the headless entry chain (which is plugin-app's
     * own src/main.tsx → src/headless.ts; Vite is rooted at plugin-app), wait for
     * the static-import graph to settle, then await every optimized/discovered
     * dep's `processing` promise so the bundles are written to disk. After this,
     * the browser's first request for headless.ts and its deps is a cache hit —
     * no mid-load re-optimize, no reload (which hmr:false would swallow anyway).
     *
     * Best-effort: a transform error here isn't fatal (the page load + ready-wait
     * is still the real gate), so we swallow failures and let startup proceed.
     */
    private async warmOptimizer(): Promise<void> {
        const server = this.server;
        if (!server) return;
        try {
            await server.transformRequest('/src/main.tsx');
            await server.transformRequest('/src/headless.ts');
            await server.waitForRequestsIdle();

            // The optimizer lives on the client environment in Vite's environment
            // API; fall back to the legacy top-level accessor for older minors.
            const env = (server as unknown as {
                environments?: { client?: { depsOptimizer?: DepsOptimizerLike } };
            }).environments?.client;
            const optimizer =
                env?.depsOptimizer ??
                (server as unknown as { depsOptimizer?: DepsOptimizerLike }).depsOptimizer;
            if (!optimizer) return;

            await optimizer.scanProcessing;
            const meta = optimizer.metadata;
            const pending = [
                ...Object.values(meta?.optimized ?? {}),
                ...Object.values(meta?.discovered ?? {}),
            ]
                .map(dep => dep?.processing)
                .filter((p): p is Promise<void> => Boolean(p));
            await Promise.all(pending);
        } catch {
            // Non-fatal: the cold-optimize race is rare and the page ready-wait
            // (plus startWithRetry in the shoot script) still backstops it.
        }
    }

    /**
     * Chromium launch options tuned for fast offscreen rendering.
     *
     * The render pipeline draws every frame through a *GPU* Skia surface
     * (`MakeWebGLCanvasSurface`), so export speed is dominated by whether
     * Chromium uses the real GPU or falls back to software (SwiftShader).
     * Playwright's default `headless: true` is the *old* headless mode, which
     * always uses SwiftShader — making CLI exports far slower than the same
     * render in `pnpm dev` (which uses your real GPU). The fix is the *new*
     * headless mode (`--headless=new`): still windowless, but GPU-accelerated.
     * That's why we pass `headless: false` and drive headlessness via the flag
     * ourselves — `headless: true` would force the slow old mode.
     *
     * Set `MS_SOFTWARE_RENDER=1` to force SwiftShader instead — needed on
     * machines with no usable GPU (some CI runners), where requesting hardware
     * acceleration would fail to create a WebGL context.
     */
    private launchOptions(): Parameters<typeof chromium.launch>[0] {
        if (process.env.MS_SOFTWARE_RENDER === '1') {
            return {
                args: [
                    '--use-gl=swiftshader',
                    '--enable-unsafe-swiftshader',
                    '--no-sandbox',
                ],
            };
        }

        const args = [
            '--headless=new',
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--mute-audio',
        ];
        // On macOS, ANGLE's Metal backend gives the real GPU (Apple M-series /
        // discrete). Elsewhere, ANGLE auto-selects the right backend (D3D11 on
        // Windows, GL/Vulkan on Linux), so no explicit flag is needed.
        if (os.platform() === 'darwin') {
            args.push('--use-angle=metal');
        }
        return { headless: false, args };
    }

    /** Vite can listen on multiple addresses; pick a concrete localhost URL. */
    private resolveServerUrl(): string {
        const urls = this.server?.resolvedUrls;
        const url = urls?.local?.[0] ?? urls?.network?.[0];
        if (!url) {
            throw new Error('Vite dev server started but exposed no URL.');
        }
        return url.replace(/\/$/, '');
    }

    /** Return the scene names declared by the project, in order. */
    async listScenes(): Promise<string[]> {
        const page = this.requirePage();
        return page.evaluate(() => window.__motionScript!.listScenes());
    }

    /** The project name from `createProject({ name })`. */
    async projectName(): Promise<string> {
        const page = this.requirePage();
        return page.evaluate(() => window.__motionScript!.projectName);
    }

    /** The project frame rate, used to convert a `<time>` screenshot spec to a frame. */
    async fps(): Promise<number> {
        const page = this.requirePage();
        return page.evaluate(() => window.__motionScript!.fps);
    }

    /**
     * Render the selected scenes. Each finished clip is delivered to
     * `options.onFile` as soon as its encode completes (so split exports stream
     * to disk one scene at a time), with progress via `options.onProgress`.
     * Resolves once every clip is done. Bytes cross the bridge base64-encoded
     * (Playwright can't round-trip a `Uint8Array`) and are decoded here.
     */
    async export(options: DriverExportOptions): Promise<void> {
        const page = this.requirePage();

        this.onProgress = options.onProgress ?? null;
        this.onFile = options.onFile
            ? (scene, base64) => options.onFile!({ scene, bytes: Buffer.from(base64, 'base64') })
            : null;

        try {
            await page.evaluate(
                ({ sceneNames, split, scale }) =>
                    window.__motionScript!.export({ sceneNames, split, scale }),
                {
                    sceneNames: options.sceneNames,
                    split: options.split ?? false,
                    scale: options.scale ?? 1,
                },
            );
        } finally {
            this.onProgress = null;
            this.onFile = null;
        }
    }

    /**
     * Render a single frame to an image and return its bytes, the frame that
     * was actually captured (the requested spec clamped into range), and the
     * timeline's total frame count. Bytes cross the bridge base64-encoded
     * (Playwright can't round-trip a `Uint8Array`) and are decoded here.
     */
    async screenshot(options: DriverScreenshotOptions): Promise<ScreenshotResult> {
        const page = this.requirePage();
        const result = await page.evaluate(
            ({ sceneNames, frame, scale, format }) =>
                window.__motionScript!.screenshot({ sceneNames, frame, scale, format }),
            {
                sceneNames: options.sceneNames,
                frame: options.frame,
                scale: options.scale ?? 1,
                format: options.format ?? 'png',
            },
        );
        return {
            frame: result.frame,
            totalFrames: result.totalFrames,
            measuredAll: result.measuredAll,
            bytes: Buffer.from(result.base64, 'base64'),
        };
    }

    async close(): Promise<void> {
        await this.page?.close().catch(() => undefined);
        await this.browser?.close().catch(() => undefined);
        await this.server?.close().catch(() => undefined);
        this.page = null;
        this.browser = null;
        this.server = null;
    }

    private requirePage(): Page {
        if (!this.page) throw new Error('Driver not started — call start() first.');
        return this.page;
    }
}

/**
 * Resolve and validate the Motion Script project root. A project is identified
 * by a `src/project.ts`/`src/project.js` entry (the convention the vite-plugin
 * discovers); a `vite.config.*` is expected but not strictly required.
 */
export function resolveProjectRoot(cwd: string): string {
    const hasProject =
        fs.existsSync(path.join(cwd, 'src', 'project.ts')) ||
        fs.existsSync(path.join(cwd, 'src', 'project.js'));
    if (!hasProject) {
        throw new Error(
            `No Motion Script project found in ${cwd}. ` +
            `Run this from a project root (expected src/project.ts).`,
        );
    }
    return cwd;
}
