import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { PluginOption, UserConfig } from 'vite';
import { buildAssetManifest, type AssetManifest } from './asset-manifest.js';
import { sceneTransform } from './scene-transform.js';
import { dataTransform } from './data-transform.js';

// __dirname resolves to dist/vite/ at runtime (the built location of this
// module). The harness app ships beside dist/, at the package root — see the
// path math in HARNESS_ROOT below.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const requireFromCli = createRequire(import.meta.url);

/**
 * The headless harness app this plugin serves: a bare `index.html` whose entry
 * installs the render bridge the driver talks to (see harness/src/main.ts).
 * Vite is rooted here, with the user's project wired in through the
 * `~user-project` / `~asset-manifest` aliases below.
 */
const HARNESS_ROOT = path.resolve(__dirname, '..', '..', 'harness');

/** The package root, one level above dist/ — needed for `server.fs.allow`. */
const CLI_ROOT = path.resolve(__dirname, '..', '..');

// Virtual module that exposes the user's (and the harness's default) public
// assets as a manifest the runtime can read. The '\0' prefix is Rollup/Vite
// convention marking a resolved id as virtual so other plugins skip it.
const ASSET_MANIFEST_ID = '~asset-manifest';
const RESOLVED_ASSET_MANIFEST_ID = '\0~asset-manifest';

/**
 * Fonts bundled with the CLI so a project renders text without shipping its own
 * typeface ("Inter", "Fira Mono"). Folded into every asset manifest and served
 * alongside the user's own `public/`.
 */
const DEFAULT_ASSETS_DIR = path.resolve(HARNESS_ROOT, 'public');

/**
 * Content types for the static files the dev middleware below serves out of the
 * harness's and the user's `public/` folders.
 *
 * Vite's own static middleware sets these; ours has to do it by hand. Missing
 * headers are not harmless: a browser sniffs a PNG happily, but fonts and JSON
 * are not sniffed, so a missing header silently breaks the load. Unknown
 * extensions are left header-less rather than guessed as octet-stream, which
 * browsers treat as a download.
 */
const STATIC_CONTENT_TYPES: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
};

/**
 * Locate canvaskit.wasm inside the installed @motion-script/canvaskit package.
 * Returns null when it can't be resolved (the user must then provide the wasm
 * themselves).
 */
function resolveCanvasKitWasm(): string | null {
    try {
        const wasmPath = path.join(
            path.dirname(requireFromCli.resolve('@motion-script/canvaskit/package.json')),
            'canvaskit.wasm',
        );
        return fs.existsSync(wasmPath) ? wasmPath : null;
    } catch {
        return null;
    }
}

/**
 * Locate `three`, which `@motion-script/skia-render` loads lazily for 3D scenes.
 *
 * Needed because the dev server's `root` is the harness, and `three` is a
 * dependency of a *nested* workspace package — so a bare `three` specifier isn't
 * resolvable from the root and Vite reports "Failed to resolve dependency". This
 * resolves it from the owning package's own location so the alias below can
 * point at the real file.
 *
 * The owner is tried in order: `three` moved to `@motion-script/skia-render` when
 * the renderer was extracted, but an older installed `@motion-script/web` still
 * owns it, and either may be what a given project has. Under pnpm's non-hoisted
 * layout the wrong guess simply doesn't resolve, so ordering is the whole fix.
 *
 * Returns null when three isn't installed, in which case no alias is registered
 * and 2D projects behave exactly as before.
 */
function resolveThree(): string | null {
    for (const owner of ['@motion-script/skia-render', '@motion-script/web']) {
        try {
            const ownerPkg = requireFromCli.resolve(`${owner}/package.json`);
            return createRequire(ownerPkg).resolve('three');
        } catch {
            // Try the next owner.
        }
    }
    // Fall back to the CLI's own resolution paths (flat node_modules, or a
    // project that depends on three directly).
    try {
        return requireFromCli.resolve('three');
    } catch {
        return null;
    }
}

/**
 * The Vite plugin the CLI's headless driver runs its dev server with.
 *
 * It is deliberately *not* something a user registers in a `vite.config`: the
 * driver builds its own config with `configFile: false` and this plugin
 * supplies everything a Motion Script render needs that plain Vite wouldn't:
 *
 * - Runs Vite rooted at the CLI's harness app, with the user's project config
 *   injected as `~user-project`.
 * - Handles the `?scene` import suffix and the `loadData` build-time macro.
 * - Serves `canvaskit.wasm` (CanvasKit has no bundler-friendly way to be loaded
 *   as an asset, so the plugin locates and serves it manually).
 * - Generates a virtual asset manifest (`~asset-manifest`) describing the user's
 *   `public/` directory plus the CLI's bundled default fonts.
 *
 * @param projectRoot Absolute path to the user's project (the CLI's cwd).
 */
export function motionScriptHarness(projectRoot: string): PluginOption[] {
    const userRoot = projectRoot;
    // Shared by the data-transform macro, the asset-manifest loader, and the
    // dev-server watcher/static-serving below — all resolve the same folder.
    const publicDir = path.resolve(userRoot, 'public');

    // buildAssetManifest re-stats and re-parses every media file it finds, which
    // is far too heavy to redo per cache validation. Memoize it; the public/
    // watcher below drops the memo whenever an asset actually changes.
    let manifestPromise: Promise<AssetManifest> | null = null;
    const getManifest = () => (manifestPromise ??= buildAssetManifest(publicDir, [DEFAULT_ASSETS_DIR]));
    const dropManifest = () => { manifestPromise = null; };

    return [
        // `?scene` import handling. Runs with enforce:'pre' so it claims the
        // `?scene` id before anything else; the wrapper it emits imports the
        // real .tsx, which then goes through the normal transform pipeline.
        sceneTransform(userRoot),
        dataTransform(publicDir),
        {
            name: 'motion-script:harness',

            // Claim the virtual module id so Vite routes loads for it to this
            // plugin instead of trying to resolve it on disk.
            resolveId(id) {
                return id === ASSET_MANIFEST_ID ? RESOLVED_ASSET_MANIFEST_ID : null;
            },

            // Build the asset manifest on demand and expose it as a default
            // export so the runtime can `import manifest from '~asset-manifest'`.
            async load(id) {
                if (id === RESOLVED_ASSET_MANIFEST_ID) {
                    return `export default ${JSON.stringify(await getManifest())};`;
                }
                return null;
            },

            configureServer(server) {
                // Watch the user's public folder; on any change, drop the memoized
                // manifest so the next request rebuilds it. The CLI runs one render
                // per process, but `ms` can be pointed at a project whose assets
                // change while a longer export is starting up.
                if (fs.existsSync(publicDir)) {
                    server.watcher.add(publicDir);
                }
                const onChange = (file: string) => {
                    if (!file.startsWith(publicDir)) return;
                    dropManifest();
                    const mod = server.moduleGraph.getModuleById(RESOLVED_ASSET_MANIFEST_ID);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                };
                server.watcher.on('add', onChange);
                server.watcher.on('change', onChange);
                server.watcher.on('unlink', onChange);

                // Serve canvaskit.wasm from wherever the @motion-script/canvaskit package lives.
                const wasmPath = resolveCanvasKitWasm();
                if (wasmPath) {
                    const resolvedWasmPath = wasmPath;
                    server.middlewares.use('/canvaskit.wasm', (_req, res) => {
                        res.setHeader('Content-Type', 'application/wasm');
                        fs.createReadStream(resolvedWasmPath).pipe(res);
                    });
                }

                // Serve the CLI's bundled default fonts and the user project's
                // public folder so asset paths like '/image.png' resolve at
                // runtime. publicDir is disabled in config() because Vite's root
                // is the harness, not the user project — serving both dirs
                // explicitly here is more reliable.
                const staticDirs = [DEFAULT_ASSETS_DIR, publicDir];
                for (const dir of staticDirs) {
                    if (!fs.existsSync(dir)) continue;
                    server.middlewares.use((req, res, next) => {
                        const url = (req as { url?: string }).url ?? '/';
                        const filePath = path.join(dir, url.split('?')[0]);
                        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                            const type = STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()];
                            if (type) res.setHeader('Content-Type', type);
                            res.end(fs.readFileSync(filePath));
                        } else {
                            next();
                        }
                    });
                }
            },

            config(): UserConfig {
                const possibleProjectFiles = ['src/project.ts', 'src/project.js'];
                const userProject = possibleProjectFiles.find(p =>
                    fs.existsSync(path.resolve(userRoot, p))
                );

                // three, for 3D scenes — optional, so the alias and optimizeDeps
                // entry below are both conditional.
                const threeEntry = resolveThree();

                return {
                    // Run Vite rooted at the harness app, with the user's project
                    // injected via the '~user-project' alias below.
                    root: HARNESS_ROOT,
                    // Still load env files (.env, etc.) from the user's project root.
                    envDir: userRoot,
                    // Key the dep-optimize cache to the user's project, not the
                    // shared harness root. `root` is the harness, so Vite would
                    // otherwise default cacheDir to <cli>/harness/node_modules/.vite
                    // — the *same* physical dir for every project rendered through a
                    // given CLI install. Two projects sharing one CLI (e.g. the e2e
                    // `lib` and `stable` variants) would then reuse each other's
                    // optimizer graph: the second project to start finds a cache
                    // discovered for the first's scene set, triggers a mid-load
                    // re-optimize, and — because the server runs with hmr:false —
                    // the in-flight import never gets the reload and 504s ("Failed
                    // to fetch dynamically imported module"). A per-project cache
                    // removes the cross-contamination.
                    cacheDir: path.resolve(userRoot, 'node_modules/.vite-motion-script'),
                    // Disabled because root is the harness, not the user project;
                    // static assets are served explicitly in configureServer instead.
                    publicDir: false,

                    server: {
                        fs: {
                            allow: [userRoot, CLI_ROOT],
                        },
                        // Vite marks pre-bundled deps immutable and cacheable for a
                        // year, keyed by a content-agnostic hash (config/lockfile,
                        // not dist file contents — see the exclude comment below).
                        // Rebuilding a workspace package's dist doesn't change that
                        // hash, so a browser profile that cached the old URL would
                        // keep serving it. no-store keeps every response live.
                        headers: {
                            'Cache-Control': 'no-store',
                        },
                    },

                    resolve: {
                        alias: {
                            // Only aliased when three is actually installed, so a
                            // 2D-only project is unaffected.
                            ...(threeEntry ? { three: threeEntry } : {}),
                            '~user-project': userProject
                                ? path.resolve(userRoot, userProject)
                                : path.resolve(HARNESS_ROOT, 'src/empty-project.ts'),
                        },
                        // The harness imports core and web; the user's scenes import
                        // core too (directly, or through the `motion-script` bundle,
                        // which re-exports it rather than vendoring a copy). Both
                        // MUST resolve to the *same* physical module: core defines
                        // runtime identity (the fill registry keyed by `type`, the
                        // Node tree shape) that breaks if the harness and the scene
                        // hold divergent copies — e.g. `Fill "undefined" is not
                        // registered`. dedupe forces a single instance even when
                        // pnpm's nested layout makes more than one reachable.
                        dedupe: [
                            '@motion-script/core',
                            '@motion-script/skia-render',
                            '@motion-script/web',
                            '@motion-script/canvaskit',
                        ],
                    },

                    optimizeDeps: {
                        // Pre-bundle canvaskit up front so Vite doesn't discover it
                        // mid-session and trigger an optimizer re-run + full reload.
                        // `three` is included for a related reason:
                        // @motion-script/skia-render is deliberately *excluded* from
                        // the optimizer (see below) and reaches three through a bare
                        // `import("three")`, so Vite can't see that dependency at
                        // server start. It would discover it on the first 3D frame,
                        // trigger a cold re-optimize + full reload, and — with
                        // `hmr: false` in the driver — fail the dynamic import with a
                        // 504. Declaring it up front is what keeps 3D rendering.
                        // Conditional so a project without three doesn't get a
                        // "failed to resolve dependency" warning on every boot.
                        include: [
                            '@motion-script/canvaskit',
                            ...(threeEntry ? ['three'] : []),
                        ],
                        // Keep core/skia-render/web OUT of the optimizer so they are
                        // served straight from their (workspace) `dist` rather than
                        // folded into an optimized chunk. The optimize hash ignores a
                        // dep's file contents, so a bundled copy goes stale on every
                        // source edit and the server keeps serving old code. Excluding
                        // them lets Vite re-read the rebuilt dist. Dedupe (above)
                        // still guarantees a single instance.
                        exclude: [
                            '@motion-script/core',
                            '@motion-script/skia-render',
                            '@motion-script/web',
                        ],
                    },
                };
            },
        },
    ];
}
