/**
 * Diff the current renders against the committed golden frames.
 *
 *   tsx scripts/golden.ts [--dir <goldenDir>] [--threshold 0.1]
 *
 * The goldens were captured from the pre-refactor build, so this answers the one
 * question a refactor of the runtime has to answer: does the renderer still draw
 * the same pixels? It is deliberately separate from `compare.ts`, which diffs
 * two *builds* of the library against each other — this diffs one build against
 * a recorded past.
 *
 * A frame that only the goldens have is reported, not failed: the harness no
 * longer renders scenes whose assets Node cannot decode (see the README), and
 * those are absences rather than regressions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

interface Args {
    dir: string;
    threshold: number;
}

function parseArgs(argv: string[]): Args {
    let dir = process.env.MS_GOLDEN_DIR ?? path.join(pkgRoot, 'golden');
    let threshold = 0.1;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dir') dir = argv[++i];
        else if (a.startsWith('--dir=')) dir = a.slice('--dir='.length);
        else if (a === '--threshold') threshold = Number(argv[++i]);
        else if (a.startsWith('--threshold=')) threshold = Number(a.slice('--threshold='.length));
    }
    return { dir, threshold };
}

function readPng(file: string): PNG {
    return PNG.sync.read(fs.readFileSync(file));
}

function main(): void {
    const { dir: goldenDir, threshold } = parseArgs(process.argv.slice(2));
    const libDir = path.join(pkgRoot, 'out', 'lib');

    if (!fs.existsSync(goldenDir)) throw new Error(`No goldens at ${goldenDir}`);
    if (!fs.existsSync(libDir)) throw new Error(`No renders at ${libDir} — run the screenshot script first.`);

    const golden = new Set(fs.readdirSync(goldenDir).filter(f => f.endsWith('.png')));
    const current = new Set(fs.readdirSync(libDir).filter(f => f.endsWith('.png')));

    const diffDir = path.join(pkgRoot, 'out', 'golden-diff');
    fs.rmSync(diffDir, { recursive: true, force: true });
    fs.mkdirSync(diffDir, { recursive: true });

    const missing: string[] = [];
    const added: string[] = [];
    const changed: { name: string; pixels: number; ratio: number }[] = [];
    let identical = 0;

    for (const name of golden) if (!current.has(name)) missing.push(name);
    for (const name of current) if (!golden.has(name)) added.push(name);

    for (const name of [...current].filter(n => golden.has(n)).sort()) {
        const a = readPng(path.join(goldenDir, name));
        const b = readPng(path.join(libDir, name));
        if (a.width !== b.width || a.height !== b.height) {
            changed.push({ name, pixels: -1, ratio: 1 });
            continue;
        }
        const diff = new PNG({ width: a.width, height: a.height });
        const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
        if (pixels === 0) {
            identical++;
            continue;
        }
        const ratio = pixels / (a.width * a.height);
        changed.push({ name, pixels, ratio });
        fs.writeFileSync(path.join(diffDir, name), PNG.sync.write(diff));
    }

    changed.sort((x, y) => y.ratio - x.ratio);

    console.log(`Golden diff — ${goldenDir}`);
    console.log(`  identical: ${identical}`);
    console.log(`  changed:   ${changed.length}`);
    console.log(`  not rendered this run: ${missing.length}`);
    console.log(`  new since the goldens:  ${added.length}`);

    if (changed.length) {
        console.log(`\nChanged (worst first, diffs in ${path.relative(pkgRoot, diffDir)}/):`);
        for (const c of changed.slice(0, 40)) {
            console.log(`  ${(c.ratio * 100).toFixed(3).padStart(8)}%  ${c.name}`);
        }
        if (changed.length > 40) console.log(`  … and ${changed.length - 40} more`);
    }
    if (missing.length) {
        const scenes = [...new Set(missing.map(n => n.split('.')[0]))];
        console.log(`\nNot rendered this run (${scenes.length} scenes): ${scenes.slice(0, 12).join(', ')}` +
            (scenes.length > 12 ? ` … +${scenes.length - 12}` : ''));
    }
}

main();
