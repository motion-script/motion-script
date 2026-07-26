import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataTransform } from './data-transform';

let publicDir: string;
let srcDir: string;

beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-data-transform-'));
    publicDir = path.join(tmpDir, 'public');
    srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(publicDir);
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(publicDir, 'data.csv'), 'name,score\nAda,10\nGrace,20\n');
});

afterEach(() => {
    fs.rmSync(path.dirname(publicDir), { recursive: true, force: true });
});

// `transform` is called with `this` bound to a Rollup TransformPluginContext at
// runtime; stub just the methods data-transform actually uses on it.
function makeContext() {
    return {
        error: (message: string) => { throw new Error(message); },
        addWatchFile: () => { },
    };
}

function callTransform(code: string, id = path.join(srcDir, 'scene.tsx')) {
    const plugin = dataTransform(publicDir);
    const transform = plugin.transform as (this: unknown, code: string, id: string) => unknown;
    return transform.call(makeContext(), code, id);
}

describe('dataTransform', () => {
    it('leaves a module with no parseData(...) call untouched', () => {
        const result = callTransform('const x = 1;');
        expect(result).toBeNull();
    });

    it('inlines a matching call to the parsed rows', () => {
        const result = callTransform(`const data = parseData("data.csv");`) as { code: string };
        expect(result.code).toBe(
            'const data = [{"name":"Ada","score":10},{"name":"Grace","score":20}];',
        );
    });

    it('inlines multiple calls in the same module', () => {
        const code = `const a = parseData("data.csv");\nconst b = parseData("data.csv");`;
        const result = callTransform(code) as { code: string };
        const expected = '[{"name":"Ada","score":10},{"name":"Grace","score":20}]';
        expect(result.code).toBe(`const a = ${expected};\nconst b = ${expected};`);
    });

    it('accepts a leading ./ and normalizes it away', () => {
        const result = callTransform(`const data = parseData("./data.csv");`) as { code: string };
        expect(result.code).toBe(
            'const data = [{"name":"Ada","score":10},{"name":"Grace","score":20}];',
        );
    });

    it('errors on a non-literal argument', () => {
        expect(() => callTransform(`const f = "data.csv"; const data = parseData(f);`)).toThrow(
            /static string literal/,
        );
    });

    it('errors on more than one argument', () => {
        expect(() => callTransform(`const data = parseData("data.csv", { delimiter: ";" });`)).toThrow(
            /static string literal/,
        );
    });

    it('errors when the file does not exist under public/', () => {
        expect(() => callTransform(`const data = parseData("missing.csv");`)).toThrow(
            /couldn't find that file/,
        );
    });
});
