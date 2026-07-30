import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import type { PluginOption, UserConfig } from 'vite';
import { buildAssetManifest, type AssetManifest } from './asset-manifest';
import { sceneTransform } from './scene-transform';
import { dataTransform } from './data-transform';
import {
    PrecompFileCache,
    PRECOMP_CACHE_ID,
    RESOLVED_PRECOMP_CACHE_ID,
    PRECOMP_ENDPOINT,
    collectSceneDeps,
    digestManifestEntry,
    readJsonBody,
} from './precomp-cache';

/**
 * Options accepted by the {@link motionScript} Vite plugin.
 */
export interface MotionScriptOptions {
    /** Optional: Explicitly define the entry file for the animation script. */
    entry?: string;
}

// __dirname here resolves to dist/ at runtime (the built location of this
// module), which is also where plugin-app and the package's node_modules
// live relative to this file — see the path math in config() below.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Packages that plugin-app owns and must be resolved from its own node_modules.
// Only the package roots are listed: each is aliased to the package *directory*
// (see config() below) so Vite runs full node/exports resolution on both the '.'
// entry and any subpath (e.g. 'react-dom/client', 'react/jsx-runtime') without us
// having to enumerate every subpath here.
const PLUGIN_APP_DEPS = ['react', 'react-dom'];

const requireFromPlugin = createRequire(import.meta.url);

/**
 * Resolve a package (sub)path through Node's module resolution so it honors the
 * target package's `exports` map. Works both in the monorepo (symlinked
 * workspace) and when this plugin is installed from npm. Returns null when the
 * specifier can't be resolved, letting callers fall back or fail loudly.
 */
function tryResolve(specifier: string): string | null {
    try {
        return requireFromPlugin.resolve(specifier);
    } catch {
        return null;
    }
}

/**
 * Version of the installed engine, used to key the precomp cache: an upgrade can
 * legitimately change what a pass produces, so entries must not survive one.
 *
 * Resolved by walking up from the package's main entry rather than asking for
 * `@motion-script/core/package.json` directly — core's `exports` map doesn't
 * expose that subpath, so the direct form throws.
 *
 * Returns null when the version genuinely can't be determined, which disables the
 * cache. Deliberately not a per-run sentinel: that would leave caching silently
 * broken forever, which is exactly the failure this returns null to make visible.
 */
function engineVersion(): string | null {
    const entry = tryResolve('@motion-script/core');
    if (!entry) return null;
    let dir = path.dirname(entry);
    for (let i = 0; i < 5; i++) {
        const pkg = path.join(dir, 'package.json');
        if (fs.existsSync(pkg)) {
            try {
                const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
                return typeof version === 'string' ? version : null;
            } catch {
                return null;
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

/**
 * Locate the built @motion-script/player package and the two files plugin-app
 * aliases to: the JS entry and the stylesheet. Resolves via the package's
 * `package.json` (an exported subpath) and reads the package's own `exports`
 * targets, so it doesn't depend on a `require`/`default` condition being present
 * on the '.' entry. Works in the monorepo (symlinked) and from an npm install.
 *
 * Throws if the package can't be resolved or its dist files are missing — it's a
 * declared dependency of this plugin, so failure means a broken/unbuilt install.
 */
function resolvePlayer(): { root: string; entry: string; style: string } {
    let pkgJsonPath: string;
    try {
        pkgJsonPath = requireFromPlugin.resolve('@motion-script/player/package.json');
    } catch {
        throw new Error(
            '[vite-plugin-motion-script] Could not resolve @motion-script/player. ' +
            'It is a dependency of this plugin — ensure it is installed.',
        );
    }

    const root = path.dirname(pkgJsonPath);
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
        exports?: Record<string, { import?: string } | string>;
    };

    // Read the package's declared export targets so we track its layout instead
    // of hardcoding dist filenames here.
    const mainExport = pkg.exports?.['.'];
    const entryRel = typeof mainExport === 'string' ? mainExport : mainExport?.import;
    const styleExport = pkg.exports?.['./style.css'];
    const styleRel = typeof styleExport === 'string' ? styleExport : styleExport?.import;

    if (!entryRel || !styleRel) {
        throw new Error(
            '[vite-plugin-motion-script] @motion-script/player is missing its "." or ' +
            '"./style.css" export. The installed player package may be incompatible.',
        );
    }

    const entry = path.resolve(root, entryRel);
    const style = path.resolve(root, styleRel);
    if (!fs.existsSync(entry) || !fs.existsSync(style)) {
        throw new Error(
            '[vite-plugin-motion-script] @motion-script/player resolved but its built ' +
            `files are missing (looked for ${entry}). Build the player before running.`,
        );
    }

    return { root, entry, style };
}

// Virtual module that exposes the user's (and plugin-app's default) public
// assets as a manifest the runtime can read. The '\0' prefix is Rollup/Vite
// convention marking a resolved id as virtual so other plugins skip it.
const ASSET_MANIFEST_ID = '~asset-manifest';
const RESOLVED_ASSET_MANIFEST_ID = '\0~asset-manifest';
const DEFAULT_ASSETS_DIR = path.resolve(__dirname, 'plugin-app', 'public');

/**
 * Locate canvaskit.wasm inside the installed @motion-script/canvaskit
 * package. Returns null when it can't be resolved (the user must then provide
 * the wasm themselves). Used both to serve it in dev and to emit it into the
 * build.
 */
function resolveCanvasKitWasm(): string | null {
    try {
        const wasmPath = path.join(
            path.dirname(requireFromPlugin.resolve('@motion-script/canvaskit/package.json')),
            'canvaskit.wasm',
        );
        return fs.existsSync(wasmPath) ? wasmPath : null;
    } catch {
        return null;
    }
}

/**
 * Locate `three`, which `@motion-script/web` loads lazily for 3D scenes.
 *
 * Needed because the dev server's `root` is plugin-app, and `three` is a
 * dependency of `@motion-script/web` — so a bare `three` specifier isn't
 * resolvable from the root and Vite reports "Failed to resolve dependency". This
 * resolves it from web's own location (mirroring how React is aliased from
 * wherever it happens to be installed) so the alias below can point at the real
 * file.
 *
 * Returns null when three isn't installed, in which case no alias is registered
 * and 2D projects behave exactly as before.
 */
function resolveThree(): string | null {
    try {
        const webPkg = requireFromPlugin.resolve('@motion-script/web/package.json');
        return createRequire(webPkg).resolve('three');
    } catch {
        // Fall back to the plugin's own resolution paths (flat node_modules, or a
        // project that depends on three directly).
        try {
            return requireFromPlugin.resolve('three');
        } catch {
            return null;
        }
    }
}

/**
 * Motion Script Vite plugin.
 *
 * Bootstraps a Motion Script project by running an internal preview app
 * ("plugin-app") with the user's animation script and project config wired in
 * as virtual aliases. It also takes care of everything the preview/build needs
 * that a plain Vite setup wouldn't provide:
 *
 * - Resolves the user's entry script (`~user-script`) and project config
 *   (`~user-project`) by convention, or from {@link MotionScriptOptions.entry}.
 * - Serves and ships `canvaskit.wasm` (CanvasKit has no bundler-friendly way
 *   to be loaded as an asset, so the plugin locates and copies it manually).
 * - Generates a virtual asset manifest (`~asset-manifest`) describing the
 *   user's `public/` directory plus plugin-app's bundled defaults, with HMR
 *   invalidation when the user's assets change.
 * - Aliases React (resolved from wherever it's installed) so plugin-app
 *   resolves correctly even when the user's project doesn't depend on React.
 * - Aliases `@motion-script/player` to its installed, prebuilt dist, resolved
 *   via Node module resolution so it works from an npm install, not just the
 *   monorepo.
 *
 * Returns a `PluginOption[]` (rather than a single plugin object) because it
 * also needs `@vitejs/plugin-react` to be active for plugin-app's JSX.
 */
export default function motionScript(options?: MotionScriptOptions): PluginOption[] {
    // Set by configResolved, read by closeBundle to know where to emit the wasm.
    let resolvedOutDir: string | null = null;
    // Shared by the data-transform macro, the asset-manifest loader, and the
    // dev-server watcher/static-serving below — all resolve the same folder.
    const publicDir = path.resolve(process.cwd(), 'public');
    const userRoot = process.cwd();

    // The project config is where fps, viewport, theme and variables live, so it
    // is an implicit dependency of every scene's precomp — editing it must
    // invalidate the whole cache, not just the scene that happens to import it.
    const projectFiles = ['src/project.ts', 'src/project.js']
        .map(p => path.resolve(userRoot, p))
        .filter(p => fs.existsSync(p));

    let precompCache: PrecompFileCache | null | undefined;
    const getPrecompCache = (): PrecompFileCache | null => {
        if (precompCache !== undefined) return precompCache;
        const version = engineVersion();
        if (!version) {
            console.warn(
                '[motion-script] could not determine the @motion-script/core version; ' +
                'the precomp cache is disabled, so scenes will be measured on every start.',
            );
            return (precompCache = null);
        }
        return (precompCache = new PrecompFileCache(userRoot, version, projectFiles));
    };

    // buildAssetManifest re-stats and re-parses every media file it finds, which
    // is far too heavy to redo per cache validation. Memoize it; the public/
    // watcher below drops the memo whenever an asset actually changes.
    let manifestPromise: Promise<AssetManifest> | null = null;
    const getManifest = () => (manifestPromise ??= buildAssetManifest(publicDir, [DEFAULT_ASSETS_DIR]));
    const dropManifest = () => { manifestPromise = null; };

    return [
        // `?scene` import handling. Runs with enforce:'pre' so it claims the
        // `?scene` id before the React plugin; the wrapper it emits imports the
        // real .tsx, which then goes through React/esbuild normally.
        sceneTransform(process.cwd()),
        dataTransform(publicDir),
        react(),
        {
            name: 'vite-plugin-motion-script',

            // Claim the virtual asset-manifest module id so Vite routes loads
            // for it to this plugin instead of trying to resolve it on disk.
            resolveId(id) {
                if (id === ASSET_MANIFEST_ID) return RESOLVED_ASSET_MANIFEST_ID;
                if (id === PRECOMP_CACHE_ID) return RESOLVED_PRECOMP_CACHE_ID;
                return null;
            },

            // Build the asset manifest on demand and expose it as a default
            // export so the runtime can `import manifest from '~asset-manifest'`.
            async load(id) {
                if (id === RESOLVED_ASSET_MANIFEST_ID) {
                    return `export default ${JSON.stringify(await getManifest())};`;
                }
                if (id === RESOLVED_PRECOMP_CACHE_ID) {
                    // Only entries whose recorded dependencies still hash the same
                    // reach the browser, so the runtime never has to judge validity
                    // — it just uses what it is handed.
                    const cache = getPrecompCache();
                    if (!cache) return 'export default {};';
                    cache.setManifestDigest(digestManifestEntry(await getManifest()));
                    return `export default ${JSON.stringify(cache.validEntries())};`;
                }
                return null;
            },

            configureServer(server) {
                const pluginAppRoot = path.resolve(__dirname, 'plugin-app');

                // Watch the user's public folder; on any change, invalidate the
                // virtual asset manifest module so the next request rebuilds it
                // and HMR pushes the new manifest into the running app.
                if (fs.existsSync(publicDir)) {
                    server.watcher.add(publicDir);
                }
                const invalidateManifest = () => {
                    dropManifest();
                    const mod = server.moduleGraph.getModuleById(RESOLVED_ASSET_MANIFEST_ID);
                    if (mod) {
                        server.moduleGraph.invalidateModule(mod);
                        server.ws.send({ type: 'full-reload' });
                    }
                };
                // Entries are validated inside `load`, and Vite only re-runs that
                // for an invalidated module. Without this, editing a scene and then
                // reloading the page (rather than restarting the server) would be
                // served the entry that was valid at startup — the stale duration
                // the hash check exists to catch. Cheap: invalidating only marks it
                // for re-transform, and the check itself is a handful of hashes.
                const invalidatePrecompCache = () => {
                    const mod = server.moduleGraph.getModuleById(RESOLVED_PRECOMP_CACHE_ID);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                };
                const onChange = (file: string) => {
                    if (file.startsWith(publicDir)) invalidateManifest();
                    invalidatePrecompCache();
                };
                server.watcher.on('add', onChange);
                server.watcher.on('change', onChange);
                server.watcher.on('unlink', onChange);

                // Accept finished scene passes from the running player and persist
                // them, so the next cold start skips the measurement entirely.
                //
                // Registered before the static-file middlewares below: those are
                // method-agnostic and would happily answer a POST with file bytes
                // if the URL happened to match something on disk.
                server.middlewares.use(PRECOMP_ENDPOINT, (req, res, next) => {
                    if (req.method !== 'POST') return next();
                    void (async () => {
                        try {
                            const body = await readJsonBody(req);
                            const { sceneId, precomp } = (body ?? {}) as { sceneId?: unknown; precomp?: unknown };
                            if (typeof sceneId !== 'string' || precomp === undefined) {
                                res.statusCode = 400;
                                res.end('bad request');
                                return;
                            }
                            // `sceneId` is a scene's `__sceneHotId` — a
                            // project-relative path from the `?scene` transform. Join
                            // and re-check rather than trusting it: it arrives over
                            // HTTP, and `..` segments must not reach outside the
                            // project. `collectSceneDeps` also drops anything that
                            // isn't a real file inside the root.
                            const sceneFile = path.resolve(userRoot, sceneId);
                            const rel = path.relative(userRoot, sceneFile);
                            if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
                                res.statusCode = 400;
                                res.end('outside project');
                                return;
                            }
                            const cache = getPrecompCache();
                            if (!cache) {
                                res.statusCode = 204;
                                res.end();
                                return;
                            }
                            cache.setManifestDigest(digestManifestEntry(await getManifest()));
                            // The browser has just run this scene, so its module
                            // graph entry is warm and its imports are known.
                            cache.put(sceneId, collectSceneDeps(server, sceneFile), precomp);
                            // Vite transforms a virtual module once and reuses the
                            // result for the server's lifetime, so without this a
                            // page reload would keep receiving whatever the cache
                            // held at startup — usually nothing, on the very run
                            // that just populated it. Invalidate only; deliberately
                            // no `ws.send`, since nothing accepts this module and an
                            // HMR push would bubble to a full reload, which would
                            // re-measure, re-post, and loop.
                            const mod = server.moduleGraph.getModuleById(RESOLVED_PRECOMP_CACHE_ID);
                            if (mod) server.moduleGraph.invalidateModule(mod);
                            res.statusCode = 204;
                            res.end();
                        } catch {
                            // A cache that cannot persist should cost speed, never
                            // correctness — the player ignores the failure and the
                            // scene is simply measured again next time.
                            res.statusCode = 500;
                            res.end('precomp cache write failed');
                        }
                    })();
                });

                // Serve canvaskit.wasm from wherever the @motion-script/canvaskit package lives.
                const wasmPath = resolveCanvasKitWasm();
                if (wasmPath) {
                    const resolvedWasmPath = wasmPath;
                    server.middlewares.use('/canvaskit.wasm', (_req, res) => {
                        res.setHeader('Content-Type', 'application/wasm');
                        fs.createReadStream(resolvedWasmPath).pipe(res);
                    });
                }

                // Serve plugin-app's own public assets (icons, favicon, etc.) and
                // the user project's public folder so asset paths like '/image.png'
                // resolve correctly at runtime. publicDir is disabled in config()
                // because Vite's root is plugin-app, not the user project — serving
                // both dirs explicitly here is more reliable.
                const staticDirs = [
                    path.resolve(pluginAppRoot, 'public'),
                    publicDir,
                ];
                for (const dir of staticDirs) {
                    if (!fs.existsSync(dir)) continue;
                    server.middlewares.use((req, res, next) => {
                        const url = (req as { url?: string }).url ?? '/';
                        const filePath = path.join(dir, url.split('?')[0]);
                        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                            res.end(fs.readFileSync(filePath));
                        } else {
                            next();
                        }
                    });
                }
            },

            config(_userConfig: UserConfig): UserConfig {
                const userRoot = process.cwd();
                const pluginAppRoot = path.resolve(__dirname, 'plugin-app');

                // Convention-based discovery of the user's entry script and
                // project config, mirroring how frameworks like Vite itself
                // probe for a default entry. An explicit `options.entry` wins.
                const possibleEntries = [
                    'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx',
                    'src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx',
                ];
                const userEntry = options?.entry
                    ?? possibleEntries.find(entry => fs.existsSync(path.resolve(userRoot, entry)));

                const possibleProjectFiles = ['src/project.ts', 'src/project.js'];
                const userProject = possibleProjectFiles.find(p =>
                    fs.existsSync(path.resolve(userRoot, p))
                );

                // __dirname is dist/ at runtime; plugin's node_modules is one level up.
                const pluginNodeModules = path.resolve(__dirname, '..', 'node_modules');

                // Resolve @motion-script/player from its package.json rather than a
                // hardcoded ../../player/dist path, so it works whether the plugin is
                // symlinked in the monorepo or installed from npm. We go via the
                // package.json (and read the package's own `exports` targets) instead
                // of resolving the '.' specifier directly: the player only declares an
                // `import` condition, so a bare require.resolve('@motion-script/player')
                // throws ERR_PACKAGE_PATH_NOT_EXPORTED. Bail loudly if it's missing —
                // it's a declared dependency, so an unresolvable player means a broken
                // install rather than something we should silently paper over.
                const { entry: playerEntry, style: playerStyle, root: playerRoot } =
                    resolvePlayer();

                // three, for 3D scenes. Unlike the player this is optional — null
                // when 3D isn't installed — so the alias and optimizeDeps entry
                // below are both conditional.
                const threeEntry = resolveThree();

                // Alias React so plugin-app source resolves it regardless of whether
                // the user's project depends on React. We alias each package to its
                // installed *directory* (not its entry file): Vite's alias appends any
                // matched subpath to the replacement, so an entry-file target would
                // turn 'react-dom/client' into '.../react-dom/index.js/client' (a
                // non-existent path). Pointing at the directory lets Vite run full
                // node/exports resolution on the result, so both the '.' entry and any
                // subpath resolve correctly. Resolve via each package's package.json so
                // it works wherever the installer puts react (top-level for npm/yarn,
                // nested for pnpm); fall back to the plugin's own node_modules for the
                // monorepo/edge cases require.resolve can't see.
                const pluginAppAliases = Object.fromEntries(
                    PLUGIN_APP_DEPS.map(dep => {
                        const pkgJson = tryResolve(`${dep}/package.json`);
                        return [
                            dep,
                            pkgJson ? path.dirname(pkgJson) : path.resolve(pluginNodeModules, dep),
                        ];
                    })
                );

                return {
                    // Run Vite rooted at plugin-app: the preview is plugin-app's
                    // own React app, with the user's script/project injected via
                    // the '~user-script' / '~user-project' aliases below.
                    root: pluginAppRoot,
                    // Still load env files (.env, etc.) from the user's project root.
                    envDir: userRoot,
                    // Key the dep-optimize cache to the user's project, not the
                    // shared plugin-app root. `root` is plugin-app, so Vite would
                    // otherwise default cacheDir to plugin-app/node_modules/.vite —
                    // the *same* physical dir for every project rendered through a
                    // given plugin install. Two projects sharing one plugin (e.g. the
                    // e2e `lib` and `stable` variants) would then reuse each other's
                    // optimizer graph: the second project to start finds a cache
                    // discovered for the first's scene set, triggers a mid-load
                    // re-optimize, and — because the headless server runs with
                    // hmr:false — the in-flight `import('./headless.ts')` never gets
                    // the reload and 504s ("Failed to fetch dynamically imported
                    // module"). A per-project cache removes the cross-contamination.
                    cacheDir: path.resolve(userRoot, 'node_modules/.vite-motion-script'),
                    // Disabled because root is plugin-app, not the user project;
                    // static assets are served explicitly in configureServer instead.
                    publicDir: false,

                    server: {
                        fs: {
                            allow: [userRoot, pluginAppRoot, pluginNodeModules, playerRoot],
                        },
                        // Vite marks pre-bundled deps (player, canvaskit — see
                        // optimizeDeps.include below) immutable and cacheable for a
                        // year, keyed by a content-agnostic hash (config/lockfile,
                        // not dist file contents — see the exclude comment below).
                        // Rebuilding player's dist doesn't change that hash, so a
                        // browser that already cached the old URL keeps serving it
                        // from disk forever and never even asks the server — which
                        // is why a fresh/incognito profile shows the update but an
                        // existing tab doesn't. no-store keeps every dev response
                        // live so a normal reload always reflects the latest build.
                        headers: {
                            'Cache-Control': 'no-store',
                        },
                    },

                    resolve: {
                        alias: {
                            ...pluginAppAliases,
                            // Only aliased when three is actually installed, so a
                            // 2D-only project is unaffected.
                            ...(threeEntry ? { three: threeEntry } : {}),
                            '@motion-script/player/style.css': playerStyle,
                            '@motion-script/player': playerEntry,
                            '~user-script': userEntry
                                ? path.resolve(userRoot, userEntry)
                                : path.resolve(pluginAppRoot, 'src/empty-fallback.js'),
                            '~user-project': userProject
                                ? path.resolve(userRoot, userProject)
                                : path.resolve(pluginAppRoot, 'src/empty-project.ts'),
                        },
                        // The player ships with @motion-script/core and /web
                        // marked external, so it imports them at runtime rather
                        // than bundling its own copy. The user's scene imports
                        // core too. Both MUST resolve to the *same* physical
                        // module: core defines runtime identity (the fill
                        // registry keyed by `type`, the Node tree shape) that
                        // breaks if the player and the scene hold divergent
                        // copies — e.g. `Fill "undefined" is not registered`.
                        // dedupe forces a single instance even when pnpm's
                        // nested layout makes more than one reachable.
                        dedupe: [
                            '@motion-script/core',
                            '@motion-script/skia-render',
                            '@motion-script/web',
                            '@motion-script/canvaskit',
                        ],
                    },

                    optimizeDeps: {
                        // Pre-bundle the player (and canvaskit) up front. The player
                        // ships as ESM but imports a CommonJS dep
                        // (use-sync-external-store/shim) and externalizes core/react;
                        // letting Vite optimize it converts that CJS into ESM with
                        // proper named exports and folds it into one stable chunk, so
                        // it resolves identically whether the plugin is run from the
                        // monorepo or installed from npm. Explicitly including it also
                        // stops Vite from discovering it mid-session and triggering an
                        // optimizer re-run + full page reload on first load.
                        // `three` is included for a different reason than the two
                        // above: @motion-script/web is deliberately *excluded* from
                        // the optimizer (see below) and reaches three through a bare
                        // `import("three")`, so Vite can't see that dependency at
                        // server start. It would discover it mid-session on the
                        // first 3D frame, trigger a cold re-optimize + full reload,
                        // and — with `hmr: false` in the headless CLI driver — fail
                        // the dynamic import with a 504. Declaring it up front is
                        // what keeps `ms screenshot`/`ms export` working for 3D.
                        // Conditional so a project without three doesn't get a
                        // "failed to resolve dependency" warning on every boot.
                        include: [
                            '@motion-script/canvaskit',
                            '@motion-script/player',
                            ...(threeEntry ? ['three'] : []),
                        ],
                        // Keep core/web/react OUT of the optimizer so they are served
                        // straight from their (workspace) `dist` rather than folded into
                        // the player's optimized chunk. The optimize hash ignores a dep's
                        // file contents, so a bundled copy goes stale on every source edit
                        // and the dev server keeps serving old code (e.g. an audio-filter
                        // fix, or a player seek-debounce change, that "doesn't take effect
                        // until restart"). react matters specifically because the player
                        // externalizes it, so the optimizer would otherwise fold a stale
                        // react into the player chunk. Excluding them lets Vite re-read the
                        // rebuilt dist. Dedupe (above) still guarantees a single instance.
                        exclude: [
                            '@motion-script/core',
                            '@motion-script/skia-render',
                            '@motion-script/web',
                            '@motion-script/react',
                        ],
                    },

                    build: {
                        outDir: path.resolve(userRoot, 'dist'),
                        emptyOutDir: true,
                    },
                };
            },

            // Capture the fully-resolved build output dir (honors any user
            // override) so closeBundle knows where to drop the wasm.
            configResolved(resolved: { build: { outDir: string } }) {
                resolvedOutDir = resolved.build.outDir;
            },

            // Production builds have no dev middleware, so the runtime request
            // for /canvaskit.wasm would 404. Emit the wasm into the build output
            // as a static asset so `vite build` produces a self-contained dist/.
            closeBundle() {
                if (!resolvedOutDir) return;
                fs.mkdirSync(resolvedOutDir, { recursive: true });

                const wasmPath = resolveCanvasKitWasm();
                if (wasmPath) {
                    fs.copyFileSync(wasmPath, path.join(resolvedOutDir, 'canvaskit.wasm'));
                }

                // Emit plugin-app's bundled default assets (fonts, etc.) into the
                // build at the site root so their manifest src ('/inter-regular.ttf')
                // resolves, matching how the dev server serves them. Don't clobber
                // anything the build already emitted.
                if (fs.existsSync(DEFAULT_ASSETS_DIR)) {
                    fs.cpSync(DEFAULT_ASSETS_DIR, resolvedOutDir, {
                        recursive: true,
                        force: false,
                        errorOnExist: false,
                    });
                }
            },
        },
    ];
}
