import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prompts from 'prompts';
import { collectDependencies, resolveComponents, writeComponentFiles } from './install.js';
import type { ComponentsConfig, RegistryItem } from './schema.js';

describe('install', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cli-install-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('collectDependencies', () => {
        it('merges "pkg@range" specs across items, deduping', () => {
            const items: RegistryItem[] = [
                { name: 'a', type: 'registry:component', files: [], dependencies: ['@lezer/common@^1.5.2', 'kleur@^4.1.5'] },
                { name: 'b', type: 'registry:component', files: [], dependencies: ['kleur@^4.1.5'] },
            ];
            expect(collectDependencies(items)).toEqual({
                '@lezer/common': '^1.5.2',
                kleur: '^4.1.5',
            });
        });

        it('returns an empty map when no item declares dependencies', () => {
            const items: RegistryItem[] = [{ name: 'a', type: 'registry:component', files: [] }];
            expect(collectDependencies(items)).toEqual({});
        });

        it('throws on a malformed spec', () => {
            const items: RegistryItem[] = [{ name: 'a', type: 'registry:component', files: [], dependencies: ['no-version'] }];
            expect(() => collectDependencies(items)).toThrow(/Invalid dependency spec/);
        });
    });

    describe('resolveComponents (local registry, registryDependencies)', () => {
        it('resolves dependencies before the item that needs them, deduping shared ones', async () => {
            const a: RegistryItem = { name: 'a', type: 'registry:component', files: [{ path: 'a.ts', content: 'a' }] };
            const b: RegistryItem = {
                name: 'b',
                type: 'registry:component',
                files: [{ path: 'b.ts', content: 'b' }],
                registryDependencies: ['a'],
            };
            const c: RegistryItem = {
                name: 'c',
                type: 'registry:component',
                files: [{ path: 'c.ts', content: 'c' }],
                registryDependencies: ['a'],
            };
            fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(a));
            fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(b));
            fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify(c));

            const resolved = await resolveComponents(['b', 'c'], null, dir);
            // "a" resolves once (deduped) and appears before both items that need it.
            expect(resolved.map(i => i.name)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('writeComponentFiles', () => {
        const config: ComponentsConfig = {
            project: 'src/project.ts',
            aliases: { components: '@/components' },
            paths: { components: 'src/components' },
        };

        it('writes files under paths.components/<item.name>/', async () => {
            const item: RegistryItem = {
                name: 'code',
                type: 'registry:component',
                files: [{ path: 'node.ts', content: 'export const x = 1;' }],
            };
            const { written, skipped } = await writeComponentFiles(item, config, dir);
            expect(skipped).toEqual([]);
            expect(written).toHaveLength(1);
            const dest = path.join(dir, 'src', 'components', 'code', 'node.ts');
            expect(fs.readFileSync(dest, 'utf8')).toBe('export const x = 1;');
        });

        it('skips an existing file when the user declines to overwrite', async () => {
            const dest = path.join(dir, 'src', 'components', 'code', 'node.ts');
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, 'original');

            const item: RegistryItem = {
                name: 'code',
                type: 'registry:component',
                files: [{ path: 'node.ts', content: 'replacement' }],
            };

            prompts.inject([false]);
            const { written, skipped } = await writeComponentFiles(item, config, dir);
            expect(written).toEqual([]);
            expect(skipped).toEqual([dest]);
            expect(fs.readFileSync(dest, 'utf8')).toBe('original');
        });

        it('force-overwrites without prompting', async () => {
            const dest = path.join(dir, 'src', 'components', 'code', 'node.ts');
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, 'original');

            const item: RegistryItem = {
                name: 'code',
                type: 'registry:component',
                files: [{ path: 'node.ts', content: 'replacement' }],
            };

            const { written } = await writeComponentFiles(item, config, dir, { force: true });
            expect(written).toEqual([dest]);
            expect(fs.readFileSync(dest, 'utf8')).toBe('replacement');
        });
    });
});
