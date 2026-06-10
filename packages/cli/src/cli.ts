#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import minimist from 'minimist';
import kleur from 'kleur';
import cliProgress from 'cli-progress';
import { HeadlessDriver, resolveProjectRoot, type ExportFile } from './driver.js';

const USAGE = `
${kleur.bold('ms')} — headless exporter for Motion Script projects

${kleur.bold('Usage')}
  ms list                       List the scenes in the current project
  ms export [options]           Render scenes to MP4 in ./out
  ms clear                      Delete exported videos from ./out

${kleur.bold('Export options')}
  --scenes <a,b,c>              Comma-separated scene names to export (default: all)
  --split                       Export each scene as its own file (default: combine into one)
  --scale <n>                   Resolution multiplier, e.g. 2 for 2x (default: 1)
  --out <dir>                   Output directory (default: out)

${kleur.bold('Examples')}
  ms list
  ms export --scenes intro,outro --split
  ms export --scenes intro --scale 2
  ms clear
`.trimStart();

const DEFAULT_OUT_DIR = 'out';

/** Parse `--scenes intro,outro` (or repeated) into a clean name list. */
function parseScenes(raw: unknown): string[] | undefined {
    if (raw === undefined) return undefined;
    const values = Array.isArray(raw) ? raw : [raw];
    const names = values
        .flatMap(v => String(v).split(','))
        .map(s => s.trim())
        .filter(Boolean);
    return names.length > 0 ? names : undefined;
}

/**
 * Strip only the characters that are illegal in a filename across platforms
 * (path separators and the Windows-reserved set), preserving case and spaces so
 * the file is named exactly after the scene/project. Trailing dots/spaces are
 * trimmed (Windows rejects them).
 */
function sanitizeFilename(value: string): string {
    const cleaned = value.replace(/[/\\:*?"<>|]/g, '').replace(/[. ]+$/, '').trim();
    return cleaned || 'export';
}

/**
 * Output filename (no extension): the scene name for a split or single-scene
 * export, otherwise the project name for a multi-scene combined render. Named
 * exactly (case preserved, no timestamp); re-exports overwrite the prior file.
 */
function buildBaseName(projectName: string, scene: string | null): string {
    return sanitizeFilename(scene ?? projectName);
}

async function runList(projectRoot: string): Promise<void> {
    const driver = new HeadlessDriver(projectRoot);
    try {
        await driver.start();
        const scenes = await driver.listScenes();
        if (scenes.length === 0) {
            console.log(kleur.yellow('No scenes found in this project.'));
            return;
        }
        for (const name of scenes) {
            console.log(name);
        }
    } finally {
        await driver.close();
    }
}

async function runExport(projectRoot: string, args: minimist.ParsedArgs): Promise<void> {
    const sceneNames = parseScenes(args.scenes);
    const split = Boolean(args.split);
    const scale = args.scale !== undefined ? Number(args.scale) : 1;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`Invalid --scale value: ${args.scale}`);
    }

    const outDir = path.resolve(projectRoot, typeof args.out === 'string' ? args.out : DEFAULT_OUT_DIR);

    const driver = new HeadlessDriver(projectRoot);
    try {
        await driver.start();
        const projectName = await driver.projectName();

        const selected = sceneNames ? sceneNames.join(', ') : 'all scenes';
        console.log(
            kleur.bold('Exporting ') + selected +
            (split ? kleur.dim(' (split)') : kleur.dim(' (combined)')) +
            (scale !== 1 ? kleur.dim(` @ ${scale}x`) : ''),
        );

        // cli-progress renders one redrawing bar per clip (multiple in --split),
        // and degrades cleanly on a non-TTY — no manual \r juggling. The bars are
        // keyed by the progress label the bridge emits (scene name, or the
        // project name for a combined render).
        const multibar = new cliProgress.MultiBar(
            {
                clearOnComplete: false,
                hideCursor: true,
                format: `  ${kleur.cyan('{bar}')} {percentage}% ${kleur.dim('{label}')}`,
                barCompleteChar: '█',
                barIncompleteChar: '░',
                // cli-progress auto-detects a TTY and animates in place there;
                // on a pipe/redirect it emits periodic plain lines instead of
                // \r spam, so the per-update-newline problem can't recur.
            },
            cliProgress.Presets.shades_grey,
        );

        const startedAt = Date.now();
        const fmtElapsed = (ms: number): string => {
            const total = Math.floor(ms / 1000);
            const m = Math.floor(total / 60);
            const s = total % 60;
            return m > 0 ? `${m}m ${s}s` : `${s}s`;
        };

        const bars = new Map<string, cliProgress.SingleBar>();
        const barFor = (label: string): cliProgress.SingleBar => {
            let bar = bars.get(label);
            if (!bar) {
                bar = multibar.create(100, 0, { label });
                bars.set(label, bar);
            }
            return bar;
        };

        // A dedicated footer bar that just shows total elapsed time, kept below
        // the scene bars and ticked once a second. (It's a plain text line, not
        // a real progress bar — the {label} carries the timer.)
        const timer = multibar.create(0, 0, { label: '' }, {
            format: `  ${kleur.dim('elapsed {label}')}`,
        });
        const tick = () => timer.update(0, { label: fmtElapsed(Date.now() - startedAt) });
        tick();
        const timerInterval = setInterval(tick, 1000);

        fs.mkdirSync(outDir, { recursive: true });

        // Written incrementally: the driver delivers each clip via onFile the
        // moment its encode finishes, so split exports land on disk one scene at
        // a time rather than all at the end. Re-exports overwrite by design.
        const written: string[] = [];
        const writeFile = (file: ExportFile) => {
            const base = buildBaseName(projectName, file.scene);
            const dest = path.join(outDir, `${base}.mp4`);
            fs.writeFileSync(dest, file.bytes);
            written.push(dest);
            const sizeMb = (file.bytes.length / (1024 * 1024)).toFixed(1);
            // Turn the finished scene's bar into a checkmark line: remove the
            // bar and log the result above the remaining live bars. Every clip
            // (including the last) goes through here, so no bar is left dangling.
            const bar = bars.get(file.scene ?? projectName);
            if (bar) multibar.remove(bar);
            multibar.log(`  ${kleur.green('✓')} ${path.relative(projectRoot, dest)} ${kleur.dim(`(${sizeMb} MB)`)}\n`);
        };

        try {
            await driver.export({
                sceneNames,
                split,
                scale,
                onProgress: (label, progress) => {
                    barFor(label).update(Math.round(progress * 100), { label });
                },
                onFile: writeFile,
            });
        } finally {
            clearInterval(timerInterval);
            multibar.remove(timer);
            multibar.stop();
        }

        console.log(
            kleur.green(`Done. ${written.length} file(s) written to ${path.relative(projectRoot, outDir)}/`) +
            kleur.dim(` (${fmtElapsed(Date.now() - startedAt)})`),
        );
    } finally {
        await driver.close();
    }
}

/**
 * `ms clear` — remove exported videos from the output directory. Deletes only
 * video files (never the directory or unrelated files), so it's safe to run in
 * a project that keeps other things in `out/`. No browser/Vite needed.
 */
function runClear(projectRoot: string, args: minimist.ParsedArgs): void {
    const outDir = path.resolve(projectRoot, typeof args.out === 'string' ? args.out : DEFAULT_OUT_DIR);
    if (!fs.existsSync(outDir)) {
        console.log(kleur.dim(`Nothing to clear — ${path.relative(projectRoot, outDir)}/ does not exist.`));
        return;
    }

    const videoExts = new Set(['.mp4', '.webm', '.mov', '.mkv']);
    const removed: string[] = [];
    for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!videoExts.has(path.extname(entry.name).toLowerCase())) continue;
        fs.rmSync(path.join(outDir, entry.name));
        removed.push(entry.name);
    }

    if (removed.length === 0) {
        console.log(kleur.dim(`No videos to clear in ${path.relative(projectRoot, outDir)}/.`));
        return;
    }
    for (const name of removed) {
        console.log(`  ${kleur.red('✗')} ${name}`);
    }
    console.log(kleur.green(`Cleared ${removed.length} video(s) from ${path.relative(projectRoot, outDir)}/.`));
}

async function main(): Promise<void> {
    const argv = minimist(process.argv.slice(2), {
        boolean: ['split', 'help', 'version'],
        alias: { h: 'help', v: 'version' },
    });

    if (argv.version) {
        // Resolve the CLI's own package.json (two levels up from dist/cli.js).
        const pkg = JSON.parse(
            fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
        ) as { version: string };
        console.log(pkg.version);
        return;
    }

    const command = argv._[0];

    if (!command || argv.help) {
        console.log(USAGE);
        return;
    }

    const projectRoot = resolveProjectRoot(process.cwd());

    switch (command) {
        case 'list':
            await runList(projectRoot);
            break;
        case 'export':
            await runExport(projectRoot, argv);
            break;
        case 'clear':
            runClear(projectRoot, argv);
            break;
        default:
            console.error(kleur.red(`Unknown command: ${command}`));
            console.log(USAGE);
            process.exitCode = 1;
    }
}

/**
 * Errors raised inside the page (e.g. an unknown scene name) surface through
 * Playwright as `page.evaluate: <real message>\n<browser stack>`. Strip the
 * wrapper prefix and the stack so the user sees just the actionable line.
 */
function cleanErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const firstLine = raw.split('\n')[0];
    return firstLine
        .replace(/^(page\.evaluate|page\.goto|page\.waitForSelector):\s*/, '')
        // The page-side message arrives as "Error: <msg>"; drop the redundant
        // prefix since we add our own "Error:" label.
        .replace(/^Error:\s*/, '');
}

main().catch((err: unknown) => {
    process.stderr.write(`\n${kleur.red('Error:')} ${cleanErrorMessage(err)}\n`);
    process.exitCode = 1;
});
