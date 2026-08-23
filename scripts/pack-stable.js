/**
 * Build the "stable" snapshot for the e2e visual tests.
 *
 * Until there is a published baseline release, we treat the *current* state of
 * the publishable @motion-script/* packages as the stable reference: this script
 * packs each one into a .tgz (exactly what `npm publish` would ship) and stands
 * up a self-contained project under packages/e2e/stable/ that runs against those
 * tarballs. The e2e screenshot harness then renders the SAME scenes twice — once
 * against this packed stable build (`--variant stable`) and once against the
 * live workspace build (`--variant lib`) — and pixel-diffs the two. Running the
 * stable side against the real tarball *contents* (not a symlinked workspace) is
 * what "run on the builds tgz to ensure full accuracy" is about: it exercises
 * the packages' published `files`/`exports`, not their source tree.
 *
 *   node scripts/pack-stable.js                # build:lib, pack, scaffold, install
 *   node scripts/pack-stable.js --no-build     # skip the rebuild (reuse current dist)
 *   node scripts/pack-stable.js --from-tarballs # reuse the COMMITTED tarballs (no build/pack)
 *
 * Invoked from the repo root via `pnpm e2e:stable` (fresh) or
 * `pnpm e2e:stable:from-tarballs` (committed baseline).
 *
 * The packed tarballs under packages/e2e/stable/tarballs/ are COMMITTED to git
 * and serve as the shared/concurrent baseline: on a feature branch your working
 * tree is rendered as `lib` and diffed against these frozen `stable` tarballs.
 * Regenerate + commit them (plain `pnpm e2e:stable`) whenever you want to move
 * the baseline forward.
 *
 * ── Why we extract tarballs instead of `pnpm install`ing them ────────────────
 * The packed packages share the workspace version (e.g. 2.9.2). If we declared
 * them as `file:*.tgz` deps and ran `pnpm install`, pnpm would key them by
 * name@version and could reuse a cached/registry extraction of the SAME version
 * for the transitive @motion-script/* peer deps (vite-plugin → core, etc.) —
 * silently mixing a stale copy in with the fresh tarballs. To guarantee the
 * snapshot is exactly the bytes we just packed, we extract every tarball
 * directly into stable/node_modules/@motion-script/<name>/ (flat, real dirs) and
 * let pnpm install only the THIRD-PARTY deps. With flat real dirs, every
 * @motion-script/* import — direct or transitive — resolves to the extracted
 * tarball; no version dedupe is possible.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const e2eRoot = path.join(repoRoot, 'packages', 'e2e');
const stableRoot = path.join(e2eRoot, 'stable');
const tarballsDir = path.join(stableRoot, 'tarballs');
const stableModules = path.join(stableRoot, 'node_modules');

/**
 * The publishable packages, in dependency order. These are the @motion-script/*
 * packages that lack `"private": true` — i.e. the ones that get published and
 * that an end-user project installs. The e2e scenes import core / code / latex;
 * the vite-plugin pulls in web / player / react / canvaskit at render time.
 *
 * Order matters: a package must appear after everything it depends on, so
 * skia-render sits between core and web (web is a thin binding layer over it).
 * A package missing from this list installs an incomplete baseline and the
 * pixel-diff silently compares against a broken stable build.
 */
const PACKAGES = [
    'packages/canvaskit',
    'packages/core',
    'packages/skia-render',
    'packages/web',
    'packages/react',
    'packages/player',
    'packages/engine',
    'packages/cli',
    'packages/motion-script',
    'packages/vite-plugin',
    'packages/components/code',
    'packages/components/latex',
];

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// On Windows we must launch pnpm through a shell (it's a `.cmd` batch file, which
// execFile can't spawn directly). But passing an args array together with
// `shell: true` is deprecated (DEP0190) — Node concatenates the args into the
// command line unescaped. So on win32 we build one quoted command string and run
// it with `shell: true` and no separate args; elsewhere we pass the args array
// directly with no shell (safer, no quoting needed).
const useShell = process.platform === 'win32';

/** Quote an arg for a Windows cmd.exe command line (handles spaces in paths). */
function winQuote(arg) {
    return /[\s"&|<>^%]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function execFileMaybeShell(cmd, args, options) {
    if (useShell) {
        const line = [cmd, ...args].map(winQuote).join(' ');
        return execFileSync(line, { ...options, shell: true });
    }
    return execFileSync(cmd, args, options);
}

function run(cmd, args, cwd) {
    console.log(`$ ${cmd} ${args.join(' ')}  (in ${path.relative(repoRoot, cwd) || '.'})`);
    execFileMaybeShell(cmd, args, { cwd, stdio: 'inherit' });
}

function readPkg(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

/**
 * Run `tar` with the archive named *relative to its own directory*.
 *
 * GNU tar reads an absolute Windows path as a remote spec — `C:\...` looks like
 * host `C`, and it fails with "Cannot connect to C: resolve failed". Passing the
 * bare filename with `cwd` set sidesteps that without a platform switch, and is
 * identical everywhere else. `-C` is unaffected: only the archive operand is
 * parsed for a host.
 */
function tar(tgz, flags, rest = [], options = {}) {
    return execFileSync('tar', [...flags, path.basename(tgz), ...rest], {
        ...options,
        cwd: path.dirname(tgz),
    });
}

/** Read a package.json embedded in a packed .tgz (package/package.json). */
function readTarballPkg(tgz) {
    const json = tar(tgz, ['-xzOf'], ['package/package.json'], { encoding: 'utf8' });
    return JSON.parse(json);
}

/** The committed, version-less stable filename for a package, e.g. `@motion-script/core` → `motion-script-core-stable.tgz`. */
function stableTarballName(pkgName) {
    return `${pkgName.replace(/^@/, '').replace(/\//g, '-')}-stable.tgz`;
}

function main() {
    const skipBuild = process.argv.includes('--no-build');
    // --from-tarballs: don't build or repack; reuse the tarballs already committed
    // under stable/tarballs/ as the baseline. This is the "concurrent version"
    // path — your working tree is `lib`, the committed tarballs are `stable`.
    const fromTarballs = process.argv.includes('--from-tarballs');

    const tarballByName = {};
    const thirdPartyDeps = {};

    if (fromTarballs) {
        collectFromExistingTarballs(tarballByName, thirdPartyDeps);
    } else {
        if (!skipBuild) {
            // Build every publishable package (everything except the docs site) so
            // the tarballs ship fresh dist/.
            run(pnpm, ['build:lib'], repoRoot);
        }
        packTarballs(tarballByName, thirdPartyDeps);
    }

    // Fresh node_modules so a stale extraction can't linger. (Tarballs are kept —
    // they're either freshly packed or the committed baseline.)
    fs.rmSync(stableModules, { recursive: true, force: true });

    scaffoldStableProject(thirdPartyDeps);
    copyProjectSources();

    // Install ONLY the third-party deps (standalone, outside the workspace).
    // The @motion-script/* packages are added by extraction below.
    run(pnpm, ['install', '--ignore-workspace', '--no-frozen-lockfile'], stableRoot);

    extractTarballs(tarballByName);
    wireBins(tarballByName);

    console.log(`\nStable snapshot ready at ${path.relative(repoRoot, stableRoot)}/`);
    console.log('Render it with:  pnpm --filter @motion-script/e2e run screenshot -- --variant stable');
}

/**
 * Pack each publishable package into stable/tarballs/<name>-stable.tgz and gather
 * its third-party deps. `pnpm pack` resolves workspace:* and catalog: protocols to
 * concrete versions in the packed package.json, so each tarball is a true publish
 * artifact. We rename to a version-LESS stable name so the committed filenames
 * stay constant across version bumps (a `2.9.2 → 2.9.3` bump doesn't churn the
 * committed set or leave orphaned old-version tarballs behind).
 */
function packTarballs(tarballByName, thirdPartyDeps) {
    fs.mkdirSync(tarballsDir, { recursive: true });
    for (const rel of PACKAGES) {
        const dir = path.join(repoRoot, rel);
        const pkg = readPkg(dir);
        const out = execFileMaybeShell(
            pnpm,
            ['pack', '--pack-destination', tarballsDir],
            { cwd: dir, encoding: 'utf8' },
        );
        const emitted = path.join(tarballsDir, path.basename(out.trim().split(/\r?\n/).pop().trim()));
        const stableBase = stableTarballName(pkg.name);
        const tgz = path.join(tarballsDir, stableBase);
        if (emitted !== tgz) {
            fs.rmSync(tgz, { force: true });
            fs.renameSync(emitted, tgz);
        }
        tarballByName[pkg.name] = tgz;
        collectThirdParty(tgz, thirdPartyDeps);
        console.log(`packed ${pkg.name} → tarballs/${stableBase}`);
    }
}

/**
 * Packages that exist on this branch but not in the committed baseline.
 *
 * The baseline is a snapshot of an *older* library, so a package added since then
 * legitimately has no tarball — and must not, or the baseline would no longer be
 * the thing it claims to be. Listing it here is what distinguishes "new package"
 * from "someone forgot to commit a tarball", which stays a hard error (see
 * {@link collectFromExistingTarballs}).
 *
 * Entries are removed when the baseline is next advanced with `pnpm e2e:stable`,
 * since the repack then produces the tarball for real.
 */
const NEW_SINCE_BASELINE = new Set([
    // (empty) — @motion-script/skia-render lived here while the baseline predated
    // it; the baseline has since been advanced and now ships its tarball.
]);

/**
 * Reuse the tarballs already committed under stable/tarballs/ (the shared
 * baseline) instead of repacking. Fails loudly if any package's tarball is
 * missing, so a partial/forgotten commit surfaces immediately rather than
 * silently rendering against an incomplete baseline — except for packages the
 * baseline predates (see {@link NEW_SINCE_BASELINE}).
 */
function collectFromExistingTarballs(tarballByName, thirdPartyDeps) {
    const missing = [];
    for (const rel of PACKAGES) {
        const pkg = readPkg(path.join(repoRoot, rel));
        const tgz = path.join(tarballsDir, stableTarballName(pkg.name));
        if (!fs.existsSync(tgz)) {
            if (NEW_SINCE_BASELINE.has(pkg.name)) {
                console.log(`skipping ${pkg.name} — newer than the committed baseline`);
                continue;
            }
            missing.push(stableTarballName(pkg.name));
            continue;
        }
        tarballByName[pkg.name] = tgz;
        collectThirdParty(tgz, thirdPartyDeps);
        console.log(`using committed tarballs/${stableTarballName(pkg.name)}`);
    }
    if (missing.length > 0) {
        throw new Error(
            `Missing committed stable tarball(s): ${missing.join(', ')}.\n` +
            `Run \`pnpm e2e:stable\` (without --from-tarballs) to (re)generate and commit them.\n` +
            `If a package is genuinely new since the baseline, add it to NEW_SINCE_BASELINE instead.`,
        );
    }
}

/**
 * Collect a packed package's NON-@motion-script runtime deps into `thirdPartyDeps`,
 * so the stable project installs them once at its root (where the flat-extracted
 * @motion-script packages resolve them). First-wins; the workspace pins one
 * version of each anyway.
 */
function collectThirdParty(tgz, thirdPartyDeps) {
    const packed = readTarballPkg(tgz);
    for (const [name, range] of Object.entries(packed.dependencies ?? {})) {
        if (name.startsWith('@motion-script/')) continue;
        if (!(name in thirdPartyDeps)) thirdPartyDeps[name] = range;
    }
}

/** Write the standalone stable project's package.json + configs (third-party deps only). */
function scaffoldStableProject(thirdPartyDeps) {
    fs.mkdirSync(stableRoot, { recursive: true });

    const pkg = {
        name: '@motion-script/e2e-stable',
        private: true,
        version: '0.0.0',
        type: 'module',
        description: 'Standalone e2e project pinned to the packed (stable) @motion-script tarballs.',
        scripts: { list: 'ms list' },
        // Every third-party runtime dep the packed @motion-script packages need,
        // hoisted to the root so the (flat-extracted) packages resolve them.
        dependencies: { ...thirdPartyDeps },
        devDependencies: {
            vite: workspaceCatalogVersion('vite'),
            typescript: workspaceCatalogVersion('typescript'),
        },
    };
    fs.writeFileSync(path.join(stableRoot, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

    fs.writeFileSync(
        path.join(stableRoot, 'vite.config.ts'),
        `import { defineConfig } from 'vite';\n` +
        `import motionScript from '@motion-script/vite-plugin';\n\n` +
        `export default defineConfig({\n  plugins: [motionScript()],\n  server: { port: 5274 },\n});\n`,
    );

    fs.writeFileSync(
        path.join(stableRoot, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    jsx: 'react-jsx',
                    experimentalDecorators: true,
                    jsxImportSource: '@motion-script/core/jsx',
                    module: 'preserve',
                    moduleResolution: 'bundler',
                    lib: ['ES2022'],
                    skipLibCheck: true,
                },
                include: ['src'],
            },
            null,
            2,
        ) + '\n',
    );

    // Note: we deliberately do NOT write a stable/.gitignore. What's tracked
    // under stable/ is governed by packages/e2e/.gitignore (which commits only
    // stable/tarballs/*.tgz). A nested .gitignore here would override that and
    // re-ignore the committed tarballs.
}

/**
 * Extract each packed tarball into node_modules/@motion-script/<name>/, replacing
 * whatever might be there. Tarballs wrap their contents in a top-level `package/`
 * dir, so we strip that component on extract.
 */
function extractTarballs(tarballByName) {
    for (const [name, tgz] of Object.entries(tarballByName)) {
        const dest = path.join(stableModules, ...name.split('/'));
        fs.rmSync(dest, { recursive: true, force: true });
        fs.mkdirSync(dest, { recursive: true });
        // --strip-components=1 drops the leading `package/` from every entry.
        // Forward slashes: GNU tar escapes backslashes in `-C`, so a native
        // Windows path arrives mangled. Every tar accepts `/` on every platform.
        tar(tgz, ['-xzf'], ['-C', dest.split(path.sep).join('/'), '--strip-components=1']);
        console.log(`extracted ${name} → node_modules/${name}/`);
    }
}

/**
 * Recreate the `ms` / `motion-script` bin shims for the extracted CLI so
 * `ms list` works in the stable project (pnpm normally writes these on install,
 * but we extracted the CLI by hand). On Windows we just rely on the harness
 * importing HeadlessDriver directly, but wire a .cmd shim too for completeness.
 */
function wireBins(tarballByName) {
    const cliName = '@motion-script/cli';
    if (!tarballByName[cliName]) return;
    const cliPkg = readTarballPkg(tarballByName[cliName]);
    const bins = cliPkg.bin ?? {};
    const binDir = path.join(stableModules, '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    for (const [binName, rel] of Object.entries(bins)) {
        const target = path.join(stableModules, ...cliName.split('/'), rel);
        // POSIX shim
        fs.writeFileSync(
            path.join(binDir, binName),
            `#!/bin/sh\nexec node "${target.replace(/\\/g, '/')}" "$@"\n`,
            { mode: 0o755 },
        );
        // Windows shim
        fs.writeFileSync(
            path.join(binDir, `${binName}.cmd`),
            `@echo off\r\nnode "${target}" %*\r\n`,
        );
    }
    console.log(`wired CLI bins: ${Object.keys(bins).join(', ') || '(none)'}`);
}

/** Look up a `catalog:` version from the root pnpm-workspace.yaml. */
function workspaceCatalogVersion(name) {
    const yaml = fs.readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    const m = yaml.match(new RegExp(`^\\s+(?:"${name}"|${name}):\\s*(.+)$`, 'm'));
    if (!m) throw new Error(`No catalog version for ${name} in pnpm-workspace.yaml`);
    return m[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Copy the e2e project's source (scenes, project entry, type shim, public assets)
 * into the stable project so both render the IDENTICAL scenes. Only the resolved
 * @motion-script/* library differs between the two — which is exactly what the
 * comparison isolates.
 */
function copyProjectSources() {
    const srcFrom = path.join(e2eRoot, 'src');
    const srcTo = path.join(stableRoot, 'src');
    fs.rmSync(srcTo, { recursive: true, force: true });
    fs.cpSync(srcFrom, srcTo, { recursive: true });

    const publicFrom = path.join(e2eRoot, 'public');
    if (fs.existsSync(publicFrom)) {
        fs.cpSync(publicFrom, path.join(stableRoot, 'public'), { recursive: true });
    }
    console.log('copied e2e src/ (+ public/ if any) into stable/');
}

main();
