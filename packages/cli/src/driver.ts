import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';

/** How long to wait for the headless bridge to install before giving up. */
const BRIDGE_READY_TIMEOUT_MS = 60_000;

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
        this.server = await createServer({
            root: this.projectRoot,
            // Quiet the dev-server banner; export progress is the only output
            // the user cares about.
            logLevel: 'warn',
            server: {
                // Ephemeral port — avoid colliding with a player dev server the
                // user may already have running on the project's configured port.
                port: 0,
                // We drive the page over CDP; never pop a real browser tab.
                open: false,
                hmr: false,
            },
        });
        await this.server.listen();

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
            if (typeof b.listScenes !== 'function') required.push('listScenes()');
            if (typeof b.projectName !== 'string') required.push('projectName');
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
