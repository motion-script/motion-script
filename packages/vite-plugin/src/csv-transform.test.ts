import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { csvTransform } from './csv-transform';

let tmpDir: string;
let csvPath: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-csv-transform-'));
    csvPath = path.join(tmpDir, 'data.csv');
    fs.writeFileSync(csvPath, 'name,score\nAda,10\nGrace,20\n');
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// The plugin hooks are called with `this` bound to a Rollup PluginContext at
// runtime; stub just the two methods csv-transform actually uses on it. Typed
// as `unknown` (rather than importing Rollup's type) since this package only
// depends on Rollup transitively, through vite.
function makeContext(resolvedId: string) {
    return {
        resolve: async () => ({ id: resolvedId }),
        addWatchFile: () => { },
    };
}

describe('csvTransform', () => {
    it('ignores specifiers without the ?csv suffix', async () => {
        const plugin = csvTransform();
        const resolveId = plugin.resolveId as (this: unknown, source: string, importer?: string) => unknown;
        const result = await resolveId.call(makeContext(csvPath), './data.csv', tmpDir);
        expect(result).toBeNull();
    });

    it('resolves a ?csv specifier to the underlying file id with the suffix kept', async () => {
        const plugin = csvTransform();
        const resolveId = plugin.resolveId as (this: unknown, source: string, importer?: string) => unknown;
        const result = await resolveId.call(makeContext(csvPath), './data.csv?csv', tmpDir);
        expect(result).toBe(`${csvPath}?csv`);
    });

    it('loads a resolved ?csv id as a parsed row-record array', () => {
        const plugin = csvTransform();
        const load = plugin.load as (this: unknown, id: string) => string | null;
        const source = load.call(makeContext(csvPath), `${csvPath}?csv`);

        expect(source).toBe(
            'export default [{"name":"Ada","score":10},{"name":"Grace","score":20}];',
        );
    });

    it('returns null for a load id without the ?csv suffix', () => {
        const plugin = csvTransform();
        const load = plugin.load as (this: unknown, id: string) => string | null;
        expect(load.call(makeContext(csvPath), csvPath)).toBeNull();
    });
});
