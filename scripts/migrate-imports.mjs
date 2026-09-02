/**
 * Replaces all @motion-script/core, @motion-script/code, and @motion-script/latex
 * import/export specifiers with `motion-script` in all .ts and .tsx source files
 * under packages/e2e/src.
 *
 * Also rewrites the @jsxImportSource pragma comment.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const SEARCH_DIRS = [
    join(ROOT, 'packages', 'e2e', 'src'),
];

const TARGET_PACKAGES = ['@motion-script/core', '@motion-script/code', '@motion-script/latex'];
const REPLACEMENT = 'motion-script';

// Matches: from '@motion-script/core'  or  from "@motion-script/code"
// Also matches: } from '...', export ... from '...', import('...')  — all via the specifier pattern
const SPECIFIER_RE = /(['"])(@motion-script\/(?:core|code|latex))(\/[^'"]*)?(\1)/g;

// Matches: @jsxImportSource @motion-script/core
const JSX_PRAGMA_RE = /(@jsxImportSource\s+)@motion-script\/(?:core|code|latex)/g;

function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip node_modules
            if (entry.name === 'node_modules') continue;
            files.push(...walk(full));
        } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
            files.push(full);
        }
    }
    return files;
}

let totalFiles = 0;
let changedFiles = 0;

for (const dir of SEARCH_DIRS) {
    const files = walk(dir);
    for (const file of files) {
        totalFiles++;
        const original = readFileSync(file, 'utf8');

        let updated = original
            .replace(JSX_PRAGMA_RE, `$1${REPLACEMENT}`)
            .replace(SPECIFIER_RE, (_, q1, _pkg, subpath, q2) => {
                // Keep any subpath (e.g. @motion-script/core/jsx → motion-script/jsx)
                const suffix = subpath || '';
                return `${q1}${REPLACEMENT}${suffix}${q2}`;
            });

        if (updated !== original) {
            writeFileSync(file, updated, 'utf8');
            changedFiles++;
            console.log(`  updated: ${file.replace(ROOT, '')}`);
        }
    }
}

console.log(`\nDone. ${changedFiles} / ${totalFiles} files updated.`);
