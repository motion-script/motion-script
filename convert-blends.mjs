import fs from 'node:fs';
import path from 'node:path';

const dir = 'packages/template/src/projects/blends/scenes';
for (const f of fs.readdirSync(dir)) {
    if (f === 'blend-demo.tsx' || f === 'index.ts') continue;
    const p = path.join(dir, f);
    const s = fs.readFileSync(p, 'utf8');
    const mode = (s.match(/mode\s*:\s*BlendMode\s*=\s*['"]([^'"]+)['"]/) || [])[1];
    if (!mode) { console.log('SKIP (no mode):', f); continue; }
    const doc = (s.match(/\/\*\*[\s\S]*?\*\//) || [''])[0];
    const out =
        `import { createScene } from "@motion-script/core";\n` +
        `import { blendDemo } from "./blend-demo";\n\n` +
        (doc ? doc + '\n' : '') +
        `export default createScene(blendDemo({ mode: ${JSON.stringify(mode)} }));\n`;
    fs.writeFileSync(p, out);
    console.log('converted', f, '->', mode);
}
