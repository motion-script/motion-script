import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { walk } from 'estree-walker';
import type { CallExpression, Program } from 'estree';
import type { Plugin } from 'vite';
import { parseCSV } from '@motion-script/core';

/** Acorn adds `start`/`end` offsets to every node it produces; `@types/estree`
 *  doesn't declare them (the spec models position via `range`/`loc` instead),
 *  so this local intersection recovers the field for the nodes we read it off. */
type Ranged = { start: number; end: number };

/**
 * `parseData(file: string)` reads a CSV file straight out of the project's
 * `public/` folder (resolved and normalized the same way an `Image`'s `src`
 * is) and inlines the parsed rows at build time:
 *
 *   const data = parseData('sales.csv');
 *
 * Scene generators step synchronously frame by frame and can't `await`
 * mid-build, so — like the data it produces — this can't go through the
 * runtime asset pipeline (`AssetTracker`/`AssetManager`): by the time a
 * scene's `stage.add` runs, `data` has to already be a plain array. This is a
 * build-time macro rather than an ordinary function call: it scans each
 * module's source for `parseData("literal")` call expressions and replaces
 * them with the already-parsed rows, so `@motion-script/core`'s exported
 * `parseData` only ever runs as a fallback (it throws) if this macro didn't
 * fire — e.g. the plugin isn't registered, or the argument isn't a static
 * string literal.
 */
const FUNCTION_NAME = 'parseData';
const FILE_RE = /\.[jt]sx?$/;

interface Edit {
    start: number;
    end: number;
    replacement: string;
}

/** Strip a leading `./`/`/` and normalize backslashes, mirroring how
 *  `AssetCatalog.normalizeKey` treats an `Image`'s `src` before looking it up
 *  in the asset manifest — so `parseData` accepts the same path spellings. */
function normalizeKey(file: string): string {
    return file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function dataTransform(publicDir: string): Plugin {
    return {
        name: 'vite-plugin-motion-script:data',

        transform(code, id) {
            if (id.includes('node_modules')) return null;
            if (!FILE_RE.test(id.split('?')[0])) return null;
            if (!code.includes(`${FUNCTION_NAME}(`)) return null;

            const ast = parse(code, {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ranges: true,
            }) as unknown as Program;

            const edits: Edit[] = [];

            walk(ast, {
                enter: (node) => {
                    if (node.type !== 'CallExpression') return;
                    const call = node as CallExpression;
                    if (call.callee.type !== 'Identifier' || call.callee.name !== FUNCTION_NAME) return;

                    const { start, end } = call as unknown as CallExpression & Ranged;
                    const arg = call.arguments[0];

                    if (call.arguments.length !== 1 || arg.type !== 'Literal' || typeof arg.value !== 'string') {
                        this.error(
                            `${FUNCTION_NAME}(...) at ${id}:${start} must be called with exactly one ` +
                            `static string literal argument (the file's path relative to your project's ` +
                            `public/ folder). Dynamic arguments aren't supported.`
                        );
                    }

                    const literal = arg.value as string;
                    const resolved = path.join(publicDir, normalizeKey(literal));
                    if (!fs.existsSync(resolved)) {
                        this.error(
                            `${FUNCTION_NAME}("${literal}") at ${id}:${start} couldn't find that file. ` +
                            `Checked "${resolved}" — make sure it exists in your project's public/ folder ` +
                            `and the path matches.`
                        );
                    }

                    this.addWatchFile(resolved);
                    const text = fs.readFileSync(resolved, 'utf8');
                    const records = parseCSV(text);
                    edits.push({ start, end, replacement: JSON.stringify(records) });
                },
            });

            if (edits.length === 0) return null;

            edits.sort((a, b) => b.start - a.start);
            let next = code;
            for (const edit of edits) {
                next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
            }

            return { code: next, map: null };
        },
    };
}
