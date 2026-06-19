import fs from 'node:fs';
import path from 'node:path';

const dir = 'packages/template/src/projects/video/scenes';

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

for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.readFileSync(p, 'utf8');
    if (!/extends VideoFillScene/.test(s)) continue;
    const specM = s.match(/(?:readonly\s+)?spec\s*(?::\s*\w+)?\s*=/);
    if (!specM) { console.log('SKIP', f); continue; }
    const obj = balancedObject(s, specM.index);
    const doc = (s.match(/\/\*\*[\s\S]*?\*\//) || [''])[0];

    // Keep the file's non-base imports (e.g. Fills); re-import what the spec needs
    // from video-fill (the factory + SAMPLE_VIDEO), plus createScene.
    const otherImports = (s.match(/^import[^\n]*\n/gm) || [])
        .filter(l => !/from ["']\.\/video-fill["']/.test(l))
        .join('');
    const needsSample = /\bSAMPLE_VIDEO\b/.test(obj);
    const fromBase = needsSample ? 'videoFill, SAMPLE_VIDEO' : 'videoFill';
    const out =
        otherImports +
        `import { createScene } from "@motion-script/core";\n` +
        `import { ${fromBase} } from "./video-fill";\n\n` +
        (doc ? doc + '\n' : '') +
        `export default createScene(videoFill(${obj}));\n`;
    fs.writeFileSync(p, out);
    console.log('converted', f);
}
