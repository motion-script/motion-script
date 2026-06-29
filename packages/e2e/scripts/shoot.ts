/**
 * Screenshot harness — capture the first / mid / last frame of every e2e scene.
 *
 *   tsx scripts/shoot.ts --variant lib            # render against the live workspace build
 *   tsx scripts/shoot.ts --variant stable         # render against the packed stable build
 *   tsx scripts/shoot.ts --variant lib --scenes rect-basic,text-basic
 *
 * Drives the project headlessly through @motion-script/cli's HeadlessDriver
 * (one Vite server + one Chromium for the whole run), and for each scene:
 *   1. captures its last frame to learn the scene's total frame count,
 *   2. resolves first / mid / last to concrete frame indices (see lib/frames.ts),
 *   3. writes each as out/<variant>/<id>.<label>.png.
 *
 * The `--variant` selects the *project root* the driver runs against:
 *   - lib    → this package (the live workspace build of @motion-script/*)
 *   - stable → ./stable (a sibling project installed from packed tarballs; see
 *              scripts/pack-stable.ts), exercising the SAME scenes against the
 *              snapshotted library so `compare.ts` can diff the two renders.
 *
 * In a headless CI / Docker environment without a usable GPU, set
 * MS_SOFTWARE_RENDER=1 so Chromium falls back to SwiftShader (see the CLI driver).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadlessDriver } from '@motion-script/cli';
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

/** Project root the driver renders against for the given variant. */
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

/** Start a driver, retrying on a fresh instance if the cold-optimize 504 race trips the ready-wait. */
async function startWithRetry(projectRoot: string, attempts = 3): Promise<HeadlessDriver> {
    let lastErr: unknown;
    for (let i = 1; i <= attempts; i++) {
        const driver = new HeadlessDriver(projectRoot);
        try {
            await driver.start();
            return driver;
        } catch (err) {
            lastErr = err;
            await driver.close();
            if (i < attempts) {
                console.log(`  driver start failed (attempt ${i}/${attempts}), retrying with a warm cache…`);
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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

    const failures: { id: string; error: string }[] = [];
    const started = Date.now();

    // On a cold Vite dep-optimize cache (fresh checkout / Docker), the very first
    // headless load can race the optimizer and 504 ("Outdated Optimize Dep"),
    // failing the driver's ready-wait. The optimize cache is warm by the next
    // attempt, so retry start() on a fresh driver a couple of times before giving
    // up. (We must use a new driver per attempt — start() isn't re-entrant.)
    const driver = await startWithRetry(projectRoot);

    try {

        // Sanity-check the project's scene list against the catalog so a stale
        // stable snapshot (missing scenes) fails loudly rather than silently.
        const available = new Set(await driver.listScenes());

        let done = 0;
        for (const entry of selected) {
            done++;
            if (!available.has(entry.name)) {
                failures.push({ id: entry.id, error: `scene "${entry.name}" not in project` });
                console.log(`  [${done}/${selected.length}] ${entry.id} — SKIP (not in project)`);
                continue;
            }
            try {
                // First capture (last frame) also tells us the scene's length.
                const lastShot = await driver.screenshot({
                    sceneNames: [entry.name],
                    frame: { kind: 'last' },
                    scale,
                    format: 'png',
                });
                const frames = resolveFrames(lastShot.totalFrames);

                for (const label of FRAME_LABELS) {
                    const shot =
                        label === 'last'
                            ? lastShot
                            : await driver.screenshot({
                                  sceneNames: [entry.name],
                                  frame: { kind: 'frame', frame: frames[label] },
                                  scale,
                                  format: 'png',
                              });
                    const dest = path.join(outDir, `${entry.id}.${label}.png`);
                    fs.writeFileSync(dest, shot.bytes);
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
        await driver.close();
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const ok = selected.length - failures.length;
    console.log(`\nDone: ${ok}/${selected.length} scenes captured in ${elapsed}s.`);

    // Record the run so compare.ts knows which scenes/frames to expect and which
    // failed to render (a render failure is itself a regression worth surfacing).
    const manifest = {
        variant,
        scale,
        capturedAt: new Date().toISOString(),
        frames: FRAME_LABELS,
        scenes: selected.map(s => ({ id: s.id, section: s.section })),
        failures,
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    if (failures.length > 0) {
        console.error(`\n${failures.length} scene(s) failed to render:`);
        for (const f of failures) console.error(`  - ${f.id}: ${f.error}`);
        process.exitCode = 1;
    }
}

main().catch((err: unknown) => {
    console.error(`\nFatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
});
