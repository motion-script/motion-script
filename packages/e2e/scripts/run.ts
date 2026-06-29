/**
 * Full e2e pipeline: render both variants, then compare.
 *
 *   tsx scripts/run.ts                       # shoot stable + lib, then compare
 *   tsx scripts/run.ts --scenes rect-basic   # restrict to some scenes (both sides)
 *   tsx scripts/run.ts --threshold 0.2       # looser pass threshold (forwarded to compare)
 *   tsx scripts/run.ts --scale 2             # 2x resolution renders
 *
 * This is what `pnpm test:e2e` runs and what the Docker image's entrypoint calls.
 * It expects the stable snapshot to already exist (built by `pnpm e2e:stable`
 * from the repo root); if it doesn't, it explains how to build it and exits.
 *
 * Each step runs in its own child process so a crash in one render can't take
 * down the others, and so a non-zero compare exit (= a visual regression) cleanly
 * fails the whole run for CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);

/** Pull a `--flag value` / `--flag=value` pair out of argv (returns undefined if absent). */
function takeOption(name: string): string | undefined {
    const eq = argv.find(a => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

const scenes = takeOption('scenes');
const scale = takeOption('scale');
const threshold = takeOption('threshold');

/** Run a tsx script as a child process; return its exit code. */
function runScript(script: string, args: string[]): number {
    const full = path.join(pkgRoot, 'scripts', script);
    console.log(`\n▶ ${script} ${args.join(' ')}`);
    const res = spawnSync(
        process.execPath,
        ['--import', 'tsx', full, ...args],
        { cwd: pkgRoot, stdio: 'inherit' },
    );
    return res.status ?? 1;
}

function shootArgs(variant: 'lib' | 'stable'): string[] {
    const a = ['--variant', variant];
    if (scenes) a.push('--scenes', scenes);
    if (scale) a.push('--scale', scale);
    return a;
}

function main(): void {
    const stableProject = path.join(pkgRoot, 'stable', 'src', 'project.ts');
    if (!fs.existsSync(stableProject)) {
        console.error(
            'No stable snapshot found.\n\n' +
            '  Build it first from the repo root:\n' +
            '    pnpm e2e:stable\n\n' +
            '  That packs the current @motion-script/* packages into tarballs and\n' +
            '  installs them under packages/e2e/stable/. Then re-run this pipeline.',
        );
        process.exit(2);
    }

    // Render the stable (packed) build first, then the live workspace build.
    const stableCode = runScript('shoot.ts', shootArgs('stable'));
    const libCode = runScript('shoot.ts', shootArgs('lib'));

    // A render failure on either side is worth surfacing, but still run the
    // compare so the report captures whatever did render (and flags the gaps).
    const compareArgs: string[] = [];
    if (threshold) compareArgs.push('--threshold', threshold);
    const compareCode = runScript('compare.ts', compareArgs);

    const renderFailed = stableCode !== 0 || libCode !== 0;
    if (renderFailed) {
        console.error(
            `\nNote: a render step exited non-zero (stable=${stableCode}, lib=${libCode}). ` +
            'Some scenes may be missing from the comparison.',
        );
    }

    // The compare exit code is the authoritative pass/fail (it already accounts
    // for scenes missing on one side). Fold in render failures so a crash can't
    // masquerade as a pass.
    process.exit(compareCode !== 0 ? compareCode : renderFailed ? 1 : 0);
}

main();
