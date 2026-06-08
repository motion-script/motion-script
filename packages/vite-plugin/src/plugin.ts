import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import type { PluginOption, UserConfig } from 'vite';
import { buildAssetManifest } from './asset-manifest';

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

    return [
        react(),
        {
            name: 'vite-plugin-motion-script',

            // Claim the virtual asset-manifest module id so Vite routes loads
            // for it to this plugin instead of trying to resolve it on disk.
            resolveId(id) {
                if (id === ASSET_MANIFEST_ID) return RESOLVED_ASSET_MANIFEST_ID;
                return null;
            },

            // Build the asset manifest on demand and expose it as a default
            // export so the runtime can `import manifest from '~asset-manifest'`.
            async load(id) {
                if (id !== RESOLVED_ASSET_MANIFEST_ID) return null;
                const publicDir = path.resolve(process.cwd(), 'public');
                const manifest = await buildAssetManifest(publicDir, [DEFAULT_ASSETS_DIR]);
                return `export default ${JSON.stringify(manifest)};`;
            },

            configureServer(server) {
                const userRoot = process.cwd();
                const pluginAppRoot = path.resolve(__dirname, 'plugin-app');
                const userPublicDir = path.resolve(userRoot, 'public');

                // Watch the user's public folder; on any change, invalidate the
                // virtual asset manifest module so the next request rebuilds it
                // and HMR pushes the new manifest into the running app.
                if (fs.existsSync(userPublicDir)) {
                    server.watcher.add(userPublicDir);
                }
                const invalidateManifest = () => {
                    const mod = server.moduleGraph.getModuleById(RESOLVED_ASSET_MANIFEST_ID);
                    if (mod) {
                        server.moduleGraph.invalidateModule(mod);
                        server.ws.send({ type: 'full-reload' });
                    }
                };
                const onChange = (file: string) => {
                    if (file.startsWith(userPublicDir)) invalidateManifest();
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

                // Serve plugin-app's own public assets (icons, favicon, etc.) and
                // the user project's public folder so asset paths like '/image.png'
                // resolve correctly at runtime. publicDir is disabled in config()
                // because Vite's root is plugin-app, not the user project — serving
                // both dirs explicitly here is more reliable.
                const staticDirs = [
                    path.resolve(pluginAppRoot, 'public'),
                    path.resolve(userRoot, 'public'),
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
                    // Disabled because root is plugin-app, not the user project;
                    // static assets are served explicitly in configureServer instead.
                    publicDir: false,

                    server: {
                        fs: {
                            allow: [userRoot, pluginAppRoot, pluginNodeModules, playerRoot],
                        },
                    },

                    resolve: {
                        alias: {
                            ...pluginAppAliases,
                            '@motion-script/player/style.css': playerStyle,
                            '@motion-script/player': playerEntry,
                            '~user-script': userEntry
                                ? path.resolve(userRoot, userEntry)
                                : path.resolve(pluginAppRoot, 'src/empty-fallback.js'),
                            '~user-project': userProject
                                ? path.resolve(userRoot, userProject)
                                : path.resolve(pluginAppRoot, 'src/empty-project.ts'),
                        },
                    },

                    optimizeDeps: {
                        include: ['@motion-script/canvaskit'],
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
