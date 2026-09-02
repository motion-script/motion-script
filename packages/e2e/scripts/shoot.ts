/**
 * Screenshot harness — capture the first / mid / last frame of every e2e scene.
 *
 *   tsx scripts/shoot.ts --variant lib            # render against the live workspace build
 *   tsx scripts/shoot.ts --variant stable         # render against the packed stable build
 *   tsx scripts/shoot.ts --variant lib --scenes rect-basic,text-basic
 *
 * Renders **in process** through `@motion-script/engine`: CanvasKit's CPU
 * rasterizer, no browser, no bundler, no dev server. It used to drive a headless
 * Chromium through the vite-plugin's `?headless` bridge, which is what made a
 * full run cost a Vite optimize pass and a page load before it drew anything.
 *
 * For each scene it:
 *   1. captures its last frame to learn the scene's total frame count,
 *   2. resolves first / mid / last to concrete frame indices (see lib/frames.ts),
 *   3. writes each as out/<variant>/<id>.<label>.png.
 *
 * The `--variant` selects which build the scenes are rendered against:
 *   - lib    → this package (the live workspace build of @motion-script/*)
 *   - stable → ./stable (a sibling project installed from packed tarballs; see
 *              scripts/pack-stable.js), exercising the SAME scenes against the
 *              snapshotted library so `compare.ts` can diff the two renders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createEngine } from '@motion-script/engine';
import type { ProjectConfig } from '@motion-script/core';
import { FRAME_LABELS, resolveFrames } from './lib/frames.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

type Variant = 'lib' | 'stable';

interface Args {
    variant: Variant;
    scenes?: string[];
    scale: number;
}

function parseArgs(argv: string[]): Args {
    let variant: Variant = 'lib';
    let scenes: string[] | undefined;
    let scale = 1;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--variant') variant = expectVariant(argv[++i]);
        else if (a.startsWith('--variant=')) variant = expectVariant(a.slice('--variant='.length));
        else if (a === '--scenes') scenes = splitScenes(argv[++i]);
        else if (a.startsWith('--scenes=')) scenes = splitScenes(a.slice('--scenes='.length));
        else if (a === '--scale') scale = Number(argv[++i]);
        else if (a.startsWith('--scale=')) scale = Number(a.slice('--scale='.length));
    }
    if (!Number.isFinite(scale) || scale <= 0) throw new Error(`Invalid --scale: ${scale}`);
    return { variant, scenes, scale };
}

function expectVariant(v: string | undefined): Variant {
    if (v === 'lib' || v === 'stable') return v;
    throw new Error(`--variant must be "lib" or "stable" (got ${v ?? '<missing>'})`);
}

function splitScenes(raw: string | undefined): string[] | undefined {
    if (!raw) return undefined;
    const names = raw.split(',').map(s => s.trim()).filter(Boolean);
    return names.length ? names : undefined;
}

interface CatalogEntry {
    id: string;
    name: string;
    section: string;
    description: string;
}

/** Read the auto-generated scene catalog (id ↔ scene-name ↔ section). */
function readCatalog(): CatalogEntry[] {
    const file = path.join(pkgRoot, 'src', 'scenes', 'catalog.json');
    if (!fs.existsSync(file)) {
        throw new Error(`Scene catalog missing at ${file} — run \`pnpm gen\` first.`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CatalogEntry[];
}

/** Project root the scenes are imported from for the given variant. */
function projectRootFor(variant: Variant): string {
    if (variant === 'lib') return pkgRoot;
    const stableRoot = path.join(pkgRoot, 'stable');
    if (!fs.existsSync(path.join(stableRoot, 'src', 'project.ts'))) {
        throw new Error(
            `Stable project not found at ${stableRoot}. Build it first with ` +
            `\`pnpm e2e:stable\` from the repo root (packs tarballs + scaffolds ./stable).`,
        );
    }
    return stableRoot;
}

/**
 * Load the variant's project module.
 *
 * A dynamic import rather than a static one because the two variants are two
 * different copies of the library, and only one of them is `this` package —
 * which is also what lets a single script diff a snapshot against the working
 * tree.
 */
async function loadProject(projectRoot: string): Promise<ProjectConfig> {
    const entry = path.join(projectRoot, 'src', 'project.ts');
    const module = await import(pathToFileURL(entry).href) as { default: ProjectConfig };
    return module.default;
}

/** Every asset a scene may reference lives under the project's `public/`. */
function assetsDirFor(projectRoot: string): string | undefined {
    const dir = path.join(projectRoot, 'public');
    return fs.existsSync(dir) ? dir : undefined;
}

async function main(): Promise<void> {
    const { variant, scenes: filter, scale } = parseArgs(process.argv.slice(2));
    const catalog = readCatalog();
    const selected = filter
        ? catalog.filter(c => filter.includes(c.id) || filter.includes(c.name))
        : catalog;

    if (selected.length === 0) {
        throw new Error('No scenes selected — check --scenes against src/scenes/catalog.json.');
    }

    const projectRoot = projectRootFor(variant);
    const outDir = path.join(pkgRoot, 'out', variant);
    fs.mkdirSync(outDir, { recursive: true });

    console.log(
        `Shooting ${selected.length} scene(s) [variant=${variant}, scale=${scale}]\n` +
        `  project: ${projectRoot}\n  output:  ${path.relative(pkgRoot, outDir)}/`,
    );

    const project = await loadProject(projectRoot);
    const engine = createEngine({
        assets: assetsDirFor(projectRoot),
        viewport: project.viewport,
        fps: project.fps,
    });

    // Scenes are addressed by the name the catalog records, which the catalog
    // module stamps on each instance.
    const byName = new Map(project.scenes.map(s => [s.name, s]));

    const failures: { id: string; error: string }[] = [];
    const started = Date.now();

    try {
        let done = 0;
        for (const entry of selected) {
            done++;
            const scene = byName.get(entry.name);
            if (!scene) {
                failures.push({ id: entry.id, error: `scene "${entry.name}" not in project` });
                console.log(`  [${done}/${selected.length}] ${entry.id} — SKIP (not in project)`);
                continue;
            }
            try {
                // Rendering one scene at a time keeps every capture's frame
                // indices scene-local, so a scene's own length is all that
                // resolves first/mid/last — the same addressing the harness used
                // when it drove one scene through the bridge.
                const source = {
                    scenes: scene,
                    viewport: project.viewport,
                    fps: project.fps,
                    theme: project.theme,
                    variables: project.variables,
                    overlays: project.overlays,
                    backgrounds: project.backgrounds,
                };

                // The first capture (last frame) also tells us the scene's length.
                const lastShot = await engine.renderImage({
                    ...source,
                    at: 'last',
                    scale,
                    format: 'png',
                });
                const frames = resolveFrames(lastShot.totalFrames);

                for (const label of FRAME_LABELS) {
                    const shot = label === 'last'
                        ? lastShot
                        : await engine.renderImage({
                            ...source,
                            at: { frame: frames[label] },
                            scale,
                            format: 'png',
                        });
                    fs.writeFileSync(path.join(outDir, `${entry.id}.${label}.png`), shot.bytes);
                }
                console.log(
                    `  [${done}/${selected.length}] ${entry.id} ✓ ` +
                    `(${lastShot.totalFrames} frames → 0/${frames.mid}/${frames.last})`,
                );
            } catch (err) {
                const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
                failures.push({ id: entry.id, error: message });
                console.log(`  [${done}/${selected.length}] ${entry.id} ✗ ${message}`);
            }
        }
    } finally {
        await engine.close();
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const ok = selected.length - failures.length;
    console.log(`\nDone: ${ok}/${selected.length} scenes captured in ${elapsed}s.`);
    if (failures.length > 0) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
        process.exitCode = 1;
    }
}

main().catch(err => {
    console.error(`\nFatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
