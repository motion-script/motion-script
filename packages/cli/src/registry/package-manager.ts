import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const LOCKFILES: Record<string, PackageManager> = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'bun.lockb': 'bun',
    'bun.lock': 'bun',
    'package-lock.json': 'npm',
};

/**
 * Detect the project's package manager. Prefers a lockfile in `projectRoot`
 * itself — deliberately *not* walking up to parent directories: an unrelated
 * lockfile higher in the tree (a stray one in the user's home directory, an
 * unconnected project) would misdetect. That means a monorepo whose lockfile
 * lives above the individual project root falls through to
 * `npm_config_user_agent` instead — which is set correctly for that case,
 * since a monorepo install/exec is normally run through the package manager
 * itself. Only the direct-invocation case (`ms add` typed straight into a
 * plain project, no wrapper setting that env var) relies on the lockfile
 * check. Final fallback is `npm`.
 */
export function detectPackageManager(projectRoot: string): PackageManager {
    for (const [file, pm] of Object.entries(LOCKFILES)) {
        if (fs.existsSync(path.join(projectRoot, file))) return pm;
    }

    const fromUa = process.env.npm_config_user_agent?.split(' ')[0]?.split('/')[0];
    if (fromUa === 'pnpm' || fromUa === 'yarn' || fromUa === 'bun' || fromUa === 'npm') return fromUa;

    return 'npm';
}

/** Merge `dependencies` (pkg -> range) into the project's package.json `dependencies`. */
export function mergePackageJsonDependencies(projectRoot: string, dependencies: Record<string, string>): void {
    if (Object.keys(dependencies).length === 0) return;

    const pkgJsonPath = path.join(projectRoot, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        [key: string]: unknown;
    };
    pkgJson.dependencies = { ...pkgJson.dependencies, ...dependencies };
    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}

/**
 * Merge `dependencies` into package.json, then run the package manager's
 * install. `shell: true` is required on Windows — npm/pnpm/yarn ship as
 * `.cmd` shims, not directly-spawnable binaries. Passed as a single command
 * string (no separate `args` array) rather than `spawnSync(pm, ['install'],
 * { shell: true })`: combining an args array with `shell: true` trips
 * Node's DEP0190 warning (args aren't escaped, only concatenated) on every
 * run. `pm` is one of the four literal {@link PackageManager} values, never
 * user input, so there's nothing to escape here regardless.
 */
export function installDependencies(pm: PackageManager, dependencies: Record<string, string>, projectRoot: string): void {
    if (Object.keys(dependencies).length === 0) return;
    mergePackageJsonDependencies(projectRoot, dependencies);

    const result = spawnSync(`${pm} install`, { cwd: projectRoot, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
        throw new Error(`"${pm} install" failed (exit code ${result.status ?? 'unknown'}).`);
    }
}
