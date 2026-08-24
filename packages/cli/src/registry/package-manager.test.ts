import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPackageManager, mergePackageJsonDependencies } from './package-manager.js';

describe('package manager', () => {
    let dir: string;
    let originalUa: string | undefined;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cli-pm-'));
        originalUa = process.env.npm_config_user_agent;
        delete process.env.npm_config_user_agent;
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        if (originalUa === undefined) delete process.env.npm_config_user_agent;
        else process.env.npm_config_user_agent = originalUa;
    });

    describe('detectPackageManager', () => {
        it('falls back to npm when nothing is detectable', () => {
            expect(detectPackageManager(dir)).toBe('npm');
        });

        it('detects pnpm from a pnpm-lock.yaml in the project root', () => {
            fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
            expect(detectPackageManager(dir)).toBe('pnpm');
        });

        it('detects yarn from a yarn.lock in the project root', () => {
            fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
            expect(detectPackageManager(dir)).toBe('yarn');
        });

        it('does not look at a lockfile in a parent directory', () => {
            const nested = path.join(dir, 'project');
            fs.mkdirSync(nested);
            fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
            // Deliberately not walking up avoids misdetecting from an
            // unrelated ancestor lockfile — falls through to npm here.
            expect(detectPackageManager(nested)).toBe('npm');
        });

        it('prefers a lockfile over npm_config_user_agent', () => {
            fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
            process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/v20 win32 x64';
            expect(detectPackageManager(dir)).toBe('pnpm');
        });

        it('falls back to npm_config_user_agent when no lockfile is present', () => {
            process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/v20 win32 x64';
            expect(detectPackageManager(dir)).toBe('pnpm');
        });
    });

    describe('mergePackageJsonDependencies', () => {
        it('merges new dependencies into an existing package.json', () => {
            fs.writeFileSync(
                path.join(dir, 'package.json'),
                JSON.stringify({ name: 'demo', dependencies: { 'motion-script': '^1.0.0' } }),
            );
            mergePackageJsonDependencies(dir, { '@lezer/common': '^1.5.2' });

            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
                dependencies: Record<string, string>;
            };
            expect(pkg.dependencies).toEqual({
                'motion-script': '^1.0.0',
                '@lezer/common': '^1.5.2',
            });
        });

        it('is a no-op for an empty dependency map', () => {
            const pkgPath = path.join(dir, 'package.json');
            fs.writeFileSync(pkgPath, JSON.stringify({ name: 'demo' }));
            const before = fs.readFileSync(pkgPath, 'utf8');
            mergePackageJsonDependencies(dir, {});
            expect(fs.readFileSync(pkgPath, 'utf8')).toBe(before);
        });
    });
});
