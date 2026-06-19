// Convert `spec`-style subclasses to createScene(<factory>(<spec object>)).
// Generic over the demo families that use `readonly spec = { ... }`.
import fs from 'node:fs';
import path from 'node:path';

const families = [
    { dir: 'packages/template/src/projects/effects/scenes', base: 'effect-demo', factory: 'effectDemo' },
    { dir: 'packages/template/src/projects/fills/scenes', base: 'shape-demo', factory: 'shapeDemo' },
    { dir: 'packages/template/src/projects/shapes/scenes', base: 'shape-scene', factory: 'shapeScene' },
    { dir: 'packages/template/src/projects/audio/scenes', base: 'audio-demo', factory: 'audioDemo' },
    { dir: 'packages/template/src/projects/draw/scenes', base: 'draw-demo', factory: 'drawDemo' },
    { dir: 'packages/template/src/projects/fills/scenes', base: 'stroke-card', factory: 'strokeCard' },
];

/** Extract the balanced `{ ... }` object literal starting at the first `{` after idx. */
function balancedObject(src, fromIdx) {
    const open = src.indexOf('{', fromIdx);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
    }
    return null;
}

for (const fam of families) {
    if (!fs.existsSync(fam.dir)) continue;
    for (const f of fs.readdirSync(fam.dir)) {
        if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue;
        if (f.startsWith(fam.base) || f === 'index.ts') continue;
        const p = path.join(fam.dir, f);
        let s = fs.readFileSync(p, 'utf8');
        // Only the `extends <BaseClass> { readonly spec ... = {...} }` shape.
        const extM = s.match(/export class \w+ extends (\w+)\s*\{/);
        const specM = s.match(/(?:readonly\s+)?spec\s*(?::\s*\w+)?\s*=/);
        if (!extM || !specM) continue;
        // Make sure this subclass belongs to THIS family's base import.
        if (!new RegExp(`from ["']\\./${fam.base}["']`).test(s)) continue;

        const obj = balancedObject(s, specM.index);
        if (!obj) { console.log('SKIP (no spec object):', f); continue; }

        const doc = (s.match(/\/\*\*[\s\S]*?\*\//) || [''])[0];
        // Preserve any imports the spec object references (e.g. FX, Fills, …) by
        // keeping the file's original import lines, then swapping the class out.
        const imports = (s.match(/^import[^\n]*\n/gm) || [])
            .filter(l => !/from ["']\.\/(?:effect-demo|shape-demo|shape-scene|audio-demo|draw-demo|stroke-card)["']/.test(l))
            .join('');
        const out =
            imports +
            `import { createScene } from "@motion-script/core";\n` +
            `import { ${fam.factory} } from "./${fam.base}";\n\n` +
            (doc ? doc + '\n' : '') +
            `export default createScene(${fam.factory}(${obj}));\n`;
        fs.writeFileSync(p, out);
        console.log('converted', f, '(' + fam.factory + ')');
    }
}
