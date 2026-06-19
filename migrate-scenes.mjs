// One-off migration: `class X extends Scene { *build(stage?) { BODY } }`
// → `export default createScene(function* (stage) { BODY })`.
// Only handles SIMPLE scenes (direct `extends Scene`, single *build method).
// Abstract bases and subclasses are migrated by hand.
import fs from 'node:fs';

const files = fs.readFileSync('simple_scenes.txt', 'utf8').split('\n').filter(Boolean);

let ok = 0, skipped = [];

for (const file of files) {
    let src = fs.readFileSync(file, 'utf8');

    // Must be the simple shape: one `export class X extends Scene {` and one
    // `*build(...)` (with an optional return-type annotation before the `{`).
    const classMatch = src.match(/export class (\w+) extends Scene\s*\{/);
    const buildMatch = src.match(/\*build\s*\(([^)]*)\)\s*(?::\s*[\w.<>[\] |]+)?\s*\{/);
    if (!classMatch || !buildMatch) { skipped.push([file, 'no simple class/build']); continue; }

    // Find the class body: from the `{` after `extends Scene` to its matching `}`.
    const classOpenIdx = src.indexOf('{', classMatch.index);
    let depth = 0, classCloseIdx = -1;
    for (let i = classOpenIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { classCloseIdx = i; break; } }
    }
    if (classCloseIdx < 0) { skipped.push([file, 'unbalanced class braces']); continue; }

    // Find the *build body within the class — the `{` after the (optional)
    // return-type annotation, i.e. the first `{` at/after the closing `)`.
    const buildKwIdx = src.indexOf('*build', classOpenIdx);
    const buildParenClose = src.indexOf(')', buildKwIdx);
    const buildOpenIdx = src.indexOf('{', buildParenClose);
    depth = 0; let buildCloseIdx = -1;
    for (let i = buildOpenIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { buildCloseIdx = i; break; } }
    }
    if (buildCloseIdx < 0) { skipped.push([file, 'unbalanced build braces']); continue; }

    // Anything in the class body OUTSIDE the build method. Trivial single-line
    // field declarations (e.g. `readonly label = 'X';`) are decoration we can
    // drop; anything else (a method, a multi-line field) needs a hand migration.
    let beforeBuild = src.slice(classOpenIdx + 1, buildKwIdx);
    const afterBuild = src.slice(buildCloseIdx + 1, classCloseIdx).trim();
    // Strip simple field declarations.
    const strippedBefore = beforeBuild
        .replace(/(readonly|private|protected|public|declare)\s+\w+\s*(:[^=;]+)?\s*=\s*[^;]+;/g, '')
        .replace(/(readonly|private|protected|public|declare)\s+\w+\s*:[^;]+;/g, '')
        .trim();
    if (strippedBefore || afterBuild) { skipped.push([file, 'extra class members']); continue; }

    let body = src.slice(buildOpenIdx + 1, buildCloseIdx);

    // Rewrite the scene-context calls: this.X → stage.X for the authoring surface.
    body = body
        .replace(/\bthis\.set\(/g, 'stage.set(')
        .replace(/\bthis\.add\(/g, 'stage.add(')
        .replace(/\bthis\.playSound\(/g, 'stage.playSound(')
        .replace(/\bthis\.startSound\(/g, 'stage.startSound(')
        .replace(/\bthis\.stopSound\(/g, 'stage.stopSound(')
        .replace(/\bthis\.clock\b/g, 'stage.clock')
        .replace(/\bthis\.assets\b/g, 'stage.assets')
        // `this.fill = X` → stage.set({ fill: X })
        .replace(/\bthis\.fill\s*=\s*([^;]+);/g, 'stage.set({ fill: $1 });');

    // Any remaining `this.` is an unhandled scene-prop access — flag for review.
    const leftover = body.match(/\bthis\.\w+/g);

    const newDecl = `export default createScene(function* (stage) {`;
    let out = src.slice(0, classMatch.index) + newDecl + body + `});\n`;
    // Trim trailing whitespace before the appended `});`
    out = out.replace(/\s*\}\);\n$/, '\n});\n');

    // Ensure createScene is imported from @motion-script/core, drop Scene if now unused.
    out = ensureCreateSceneImport(out);

    fs.writeFileSync(file, out);
    ok++;
    if (leftover) console.log(`  ⚠ ${file} leftover this.: ${[...new Set(leftover)].join(', ')}`);
}

function ensureCreateSceneImport(src) {
    // Add createScene to an existing `from "@motion-script/core"` import if present.
    const importRe = /import\s*\{([^}]*)\}\s*from\s*["']@motion-script\/core["'];?/;
    const m = src.match(importRe);
    if (m) {
        let names = m[1].split(',').map(s => s.trim()).filter(Boolean);
        // Scene is no longer needed as a base; remove it unless still referenced as a type.
        const stillUsesScene = new RegExp('\\bScene\\b').test(src.replace(importRe, ''));
        names = names.filter(n => n !== 'Scene' || stillUsesScene);
        if (!names.includes('createScene')) names.unshift('createScene');
        const rebuilt = `import { ${names.join(', ')} } from "@motion-script/core";`;
        return src.replace(importRe, rebuilt);
    }
    // No core import — add one at the top (after a leading jsx pragma comment if any).
    const line = `import { createScene } from "@motion-script/core";\n`;
    const pragma = src.match(/^\/\*\* @jsxImportSource[^\n]*\n/);
    if (pragma) return src.slice(0, pragma[0].length) + '\n' + line + src.slice(pragma[0].length);
    return line + src;
}

console.log(`\nMigrated ${ok}/${files.length}.`);
if (skipped.length) {
    console.log('Skipped (migrate by hand):');
    for (const [f, why] of skipped) console.log(`  - ${f}  [${why}]`);
}
