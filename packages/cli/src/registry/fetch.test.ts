import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchRegistryIndex, fetchRegistryItem, readRegistrySource, resolveItemUrl } from './fetch.js';
import type { ComponentsConfig, RegistryItem } from './schema.js';

describe('registry fetch', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cli-fetch-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('resolveItemUrl', () => {
        it('resolves a bare name against the default registry', () => {
            const { url, itemName } = resolveItemUrl('code', null, 'https://example.com/r');
            expect(url).toBe('https://example.com/r/code.json');
            expect(itemName).toBe('code');
        });

        it('resolves a bare name against a local default registry path', () => {
            const { url } = resolveItemUrl('code', null, dir);
            expect(url).toBe(path.join(dir, 'code.json'));
        });

        it('resolves a namespaced name against components.json registries, interpolating env headers', () => {
            const config: ComponentsConfig = {
                project: 'src/project.ts',
                aliases: { components: '@/components' },
                paths: { components: 'src/components' },
                registries: {
                    '@acme': {
                        url: 'https://registry.acme.dev/{name}.json',
                        headers: { Authorization: 'Bearer ${MS_TEST_TOKEN}' },
                    },
                },
            };
            process.env.MS_TEST_TOKEN = 'secret123';
            const { url, headers, itemName } = resolveItemUrl('@acme/button', config);
            expect(url).toBe('https://registry.acme.dev/button.json');
            expect(itemName).toBe('button');
            expect(headers).toEqual({ Authorization: 'Bearer secret123' });
            delete process.env.MS_TEST_TOKEN;
        });

        it('accepts a bare string registry entry (no headers)', () => {
            const config: ComponentsConfig = {
                project: 'src/project.ts',
                aliases: { components: '@/components' },
                paths: { components: 'src/components' },
                registries: { '@acme': 'https://registry.acme.dev/{name}.json' },
            };
            const { url, headers } = resolveItemUrl('@acme/button', config);
            expect(url).toBe('https://registry.acme.dev/button.json');
            expect(headers).toBeUndefined();
        });

        it('throws for an unknown namespace', () => {
            const config: ComponentsConfig = {
                project: 'src/project.ts',
                aliases: { components: '@/components' },
                paths: { components: 'src/components' },
            };
            expect(() => resolveItemUrl('@missing/button', config)).toThrow(/Unknown registry namespace/);
        });

        it('throws when a registry URL has no "{name}" placeholder', () => {
            const config: ComponentsConfig = {
                project: 'src/project.ts',
                aliases: { components: '@/components' },
                paths: { components: 'src/components' },
                registries: { '@acme': 'https://registry.acme.dev/static.json' },
            };
            expect(() => resolveItemUrl('@acme/button', config)).toThrow(/must contain a literal/);
        });
    });

    describe('readRegistrySource', () => {
        it('reads a local file path', async () => {
            const file = path.join(dir, 'thing.json');
            fs.writeFileSync(file, JSON.stringify({ hello: 'world' }));
            expect(await readRegistrySource(file)).toEqual({ hello: 'world' });
        });

        it('reads a file:// URL', async () => {
            const file = path.join(dir, 'thing.json');
            fs.writeFileSync(file, JSON.stringify({ hello: 'world' }));
            expect(await readRegistrySource(pathToFileURL(file).href)).toEqual({ hello: 'world' });
        });

        it('throws a clear error for a missing local file', async () => {
            await expect(readRegistrySource(path.join(dir, 'missing.json'))).rejects.toThrow(/not found/);
        });
    });

    describe('fetchRegistryIndex / fetchRegistryItem (local registry)', () => {
        it('reads an index and an item from a local registry directory', async () => {
            fs.writeFileSync(
                path.join(dir, 'registry.json'),
                JSON.stringify([{ name: 'code', type: 'registry:component' }]),
            );
            const item: RegistryItem = {
                name: 'code',
                type: 'registry:component',
                files: [{ path: 'node.ts', content: 'x' }],
            };
            fs.writeFileSync(path.join(dir, 'code.json'), JSON.stringify(item));

            expect(await fetchRegistryIndex(dir)).toEqual([{ name: 'code', type: 'registry:component' }]);
            expect(await fetchRegistryItem('code', null, dir)).toEqual(item);
        });

        it('rejects a malformed item', async () => {
            fs.writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ name: 'broken' }));
            await expect(fetchRegistryItem('broken', null, dir)).rejects.toThrow(/Malformed registry item/);
        });

        it('rejects a malformed index', async () => {
            fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify({ not: 'an array' }));
            await expect(fetchRegistryIndex(dir)).rejects.toThrow(/Malformed registry index/);
        });
    });
});
