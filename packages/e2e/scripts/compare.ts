/**
 * Compare the `stable` and `lib` screenshot sets and report visual regressions.
 *
 *   tsx scripts/compare.ts                 # diff out/stable vs out/lib
 *   tsx scripts/compare.ts --threshold 0.1 # fail a frame above 0.1% changed px
 *
 * For every scene × frame (first / mid / last) it pixel-diffs the two PNGs with
 * pixelmatch, writes a magenta diff image to out/diff/, and records the share of
 * changed pixels. A frame fails when that share exceeds `--threshold` (percent
 * of pixels, default 0.1%) — a small tolerance absorbs sub-pixel AA noise while
 * still catching real rendering changes. A scene present in one set but not the
 * other (e.g. a render failure on one side) is also a failure.
 *
 * Writes a single self-contained out/report.html (all images embedded as data
 * URIs, so it opens anywhere — including copied out of a Docker container) and
 * exits non-zero if any frame fails, so CI fails the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { FRAME_LABELS, type FrameLabel } from './lib/frames.ts';
import { buildReportHtml, type SceneReport, type FrameResult } from './lib/report.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const outDir = path.join(pkgRoot, 'out');

interface Args {
    /** Max share of changed pixels (percent) before a frame is a failure. */
    threshold: number;
    /** Per-pixel colour-distance sensitivity passed to pixelmatch (0 strict … 1 loose). */
    pixelThreshold: number;
}

function parseArgs(argv: string[]): Args {
    let threshold = 0.1;
    let pixelThreshold = 0.1;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--threshold') threshold = Number(argv[++i]);
        else if (a.startsWith('--threshold=')) threshold = Number(a.slice('--threshold='.length));
        else if (a === '--pixel-threshold') pixelThreshold = Number(argv[++i]);
        else if (a.startsWith('--pixel-threshold=')) pixelThreshold = Number(a.slice('--pixel-threshold='.length));
    }
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error(`Invalid --threshold: ${threshold}`);
    return { threshold, pixelThreshold };
}

interface CatalogEntry { id: string; name: string; section: string; description: string }

function readCatalog(): CatalogEntry[] {
    const file = path.join(pkgRoot, 'src', 'scenes', 'catalog.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CatalogEntry[];
}

/** The scene ids actually captured for a variant (from its manifest, falling back to the catalog). */
function capturedIds(variant: 'stable' | 'lib', fallback: CatalogEntry[]): Set<string> {
    const manifestPath = path.join(outDir, variant, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { scenes: { id: string }[] };
        return new Set(m.scenes.map(s => s.id));
    }
    return new Set(fallback.map(c => c.id));
}

function shotPath(variant: 'stable' | 'lib', id: string, label: FrameLabel): string {
    return path.join(outDir, variant, `${id}.${label}.png`);
}

/** Diff one frame. Returns the changed-pixel share (0–100) or a structural error. */
function diffFrame(
    id: string,
    label: FrameLabel,
    diffDir: string,
): FrameResult {
    const stablePath = shotPath('stable', id, label);
    const libPath = shotPath('lib', id, label);
    const haveStable = fs.existsSync(stablePath);
    const haveLib = fs.existsSync(libPath);

    if (!haveStable || !haveLib) {
        return {
            label,
            status: 'missing',
            mismatch: haveStable === haveLib ? 0 : 100,
            note: !haveStable && !haveLib ? 'absent in both' : !haveStable ? 'missing in stable' : 'missing in lib',
            stablePath: haveStable ? stablePath : undefined,
            libPath: haveLib ? libPath : undefined,
        };
    }

    const stable = PNG.sync.read(fs.readFileSync(stablePath));
    const lib = PNG.sync.read(fs.readFileSync(libPath));

    if (stable.width !== lib.width || stable.height !== lib.height) {
        return {
            label,
            status: 'fail',
            mismatch: 100,
            note: `dimension mismatch ${stable.width}x${stable.height} vs ${lib.width}x${lib.height}`,
            stablePath,
            libPath,
        };
    }

    const { width, height } = stable;
    const diff = new PNG({ width, height });
    const changed = pixelmatch(stable.data, lib.data, diff.data, width, height, {
        threshold: 0.1,
        includeAA: false,
        alpha: 0.4,
    });
    const mismatch = (changed / (width * height)) * 100;

    const diffPath = path.join(diffDir, `${id}.${label}.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    return { label, status: 'ok', mismatch, stablePath, libPath, diffPath };
}

function main(): void {
    const { threshold } = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(path.join(outDir, 'lib')) || !fs.existsSync(path.join(outDir, 'stable'))) {
        throw new Error(
            'Both out/stable and out/lib must exist. Run the screenshot harness for each ' +
            'variant first (pnpm test:e2e runs the whole pipeline).',
        );
    }

    const catalog = readCatalog();
    const ids = new Set<string>([...capturedIds('stable', catalog), ...capturedIds('lib', catalog)]);
    const orderedCatalog = catalog.filter(c => ids.has(c.id));

    const diffDir = path.join(outDir, 'diff');
    fs.mkdirSync(diffDir, { recursive: true });

    const reports: SceneReport[] = [];
    let failedFrames = 0;
    let totalFrames = 0;

    for (const entry of orderedCatalog) {
        const frames = FRAME_LABELS.map(label => diffFrame(entry.id, label, diffDir));
        for (const f of frames) {
            totalFrames++;
            const failed = f.status !== 'ok' || f.mismatch > threshold;
            f.failed = failed;
            if (failed) failedFrames++;
        }
        reports.push({
            id: entry.id,
            section: entry.section,
            description: entry.description,
            frames,
            failed: frames.some(f => f.failed),
        });
    }

    const failedScenes = reports.filter(r => r.failed).length;

    // Emit the self-contained HTML report (images embedded as data URIs).
    const html = buildReportHtml({
        threshold,
        totalScenes: reports.length,
        failedScenes,
        totalFrames,
        failedFrames,
        generatedAt: new Date().toISOString(),
        scenes: reports,
    });
    const reportPath = path.join(outDir, 'report.html');
    fs.writeFileSync(reportPath, html);

    // Machine-readable summary alongside the HTML.
    fs.writeFileSync(
        path.join(outDir, 'compare-summary.json'),
        JSON.stringify(
            {
                threshold,
                totalScenes: reports.length,
                failedScenes,
                totalFrames,
                failedFrames,
                failures: reports
                    .filter(r => r.failed)
                    .map(r => ({
                        id: r.id,
                        frames: r.frames.filter(f => f.failed).map(f => ({ label: f.label, mismatch: f.mismatch, note: f.note })),
                    })),
            },
            null,
            2,
        ) + '\n',
    );

    console.log(
        `\nComparison: ${reports.length - failedScenes}/${reports.length} scenes match ` +
        `(${failedFrames}/${totalFrames} frames over ${threshold}% threshold).`,
    );
    console.log(`Report: ${path.relative(pkgRoot, reportPath)}`);

    if (failedScenes > 0) {
        console.error(`\n${failedScenes} scene(s) differ:`);
        for (const r of reports.filter(s => s.failed)) {
            const detail = r.frames
                .filter(f => f.failed)
                .map(f => `${f.label}=${f.note ?? `${f.mismatch.toFixed(3)}%`}`)
                .join(', ');
            console.error(`  - ${r.id}: ${detail}`);
        }
        process.exitCode = 1;
    }
}

main();
