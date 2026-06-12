#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import minimist from 'minimist';
import kleur from 'kleur';
import cliProgress from 'cli-progress';
import { HeadlessDriver, resolveProjectRoot, type ExportFile, type FrameSpec } from './driver.js';

const USAGE = `
${kleur.bold('ms')} — headless exporter for Motion Script projects

${kleur.bold('Usage')}
  ms list                       List the scenes in the current project
  ms export [options]           Render scenes to MP4 in ./out/videos
  ms screenshot <when> [opts]   Capture a single frame to ./out/screenshots
  ms clear                      Delete exported videos and screenshots from ./out

${kleur.bold('Export options')}
  --scenes <a,b,c>              Comma-separated scene names to export (default: all)
  --split                       Export each scene as its own file (default: combine into one)
  --scale <n>                   Resolution multiplier, e.g. 2 for 2x (default: 1)
  --out <dir>                   Output directory (default: out)

${kleur.bold('Screenshot')}
  ms screenshot <when>          <when> is a frame number, a time, first, or last.
                                A bare integer is a frame (e.g. 42); a decimal or
                                a value with an 's' suffix is a time in seconds
                                (e.g. 2.5 or 2.5s). Output goes to ./out/screenshots.
  --split                       Capture <when> for each scene separately (e.g.
                                'first --split' = frame 0 of every scene). Without
                                it, <when> resolves against the combined timeline.
  --scenes <a,b,c>              Scenes whose timeline the frame is taken from (default: all)
  --scale <n>                   Resolution multiplier (default: 1)
  --format <png|jpg>            Image format (default: png)
  --out <dir>                   Output directory (default: out)

${kleur.bold('Examples')}
  ms list
  ms export --scenes intro,outro --split
  ms export --scenes intro --scale 2
  ms screenshot last
  ms screenshot first --split
  ms screenshot 42 --format jpg
  ms screenshot 2.5s --scenes intro --scale 2
  ms clear
`.trimStart();

const DEFAULT_OUT_DIR = 'out';
const VIDEO_SUBDIR = 'videos';
const SCREENSHOT_SUBDIR = 'screenshots';

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
 * Validate the screenshot `<when>` positional and parse it into a frame spec.
 *
 * - `first` / `last` → that end of the timeline.
 * - A bare integer (e.g. `42`) → that global frame.
 * - A decimal (e.g. `2.5`) or a value with an `s` suffix (e.g. `2.5s`, `3s`)
 *   → a time in seconds (resolved to a frame later, once fps is known).
 *
 * The integer-vs-decimal/`s` split is what disambiguates "frame" from "time":
 * frame indices are whole numbers, times are written with a decimal or `s`.
 *
 * Returns a {@link FrameSpec} directly for frame/first/last, or `{ seconds }`
 * for a time — kept separate so the shape can be validated *before* launching
 * the browser, with only the seconds→frame conversion deferred until fps is
 * read from the project.
 */
function parseWhen(raw: unknown): FrameSpec | { seconds: number } {
    if (raw === undefined || raw === '') {
        throw new Error('Missing frame for screenshot — pass a frame number, a time, first, or last.');
    }
    const value = String(raw).trim().toLowerCase();

    if (value === 'first') return { kind: 'first' };
    if (value === 'last') return { kind: 'last' };

    // Explicit time: a trailing 's' (e.g. "2.5s", "3s").
    if (value.endsWith('s')) {
        const seconds = Number(value.slice(0, -1));
        if (!Number.isFinite(seconds) || seconds < 0) {
            throw new Error(`Invalid time for screenshot: ${raw}`);
        }
        return { seconds };
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`Invalid frame/time for screenshot: ${raw} (expected a frame number, a time, first, or last).`);
    }
    // A whole number is a frame index; a fractional one is a time in seconds.
    if (Number.isInteger(num)) return { kind: 'frame', frame: num };
    return { seconds: num };
}

/** Resolve a parsed `<when>` to a concrete {@link FrameSpec}, converting any time to a frame via `fps`. */
function resolveFrameSpec(when: FrameSpec | { seconds: number }, fps: number): FrameSpec {
    if ('seconds' in when) return { kind: 'frame', frame: Math.round(when.seconds * fps) };
    return when;
}

/** Normalize a `--format` value to a supported image format (png is the default). */
function parseFormat(raw: unknown): { format: 'png' | 'jpeg'; ext: string } {
    if (raw === undefined) return { format: 'png', ext: 'png' };
    const value = String(raw).trim().toLowerCase().replace(/^\./, '');
    switch (value) {
        case 'png':
            return { format: 'png', ext: 'png' };
        case 'jpg':
            return { format: 'jpeg', ext: 'jpg' };
        case 'jpeg':
            return { format: 'jpeg', ext: 'jpeg' };
        default:
            throw new Error(`Unsupported --format: ${raw} (supported: png, jpg, jpeg).`);
    }
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

    const outDir = path.resolve(
        projectRoot,
        typeof args.out === 'string' ? args.out : DEFAULT_OUT_DIR,
        VIDEO_SUBDIR,
    );

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
 * `ms screenshot <when>` — render a single frame to ./out/screenshots.
 *
 * `<when>` (the first positional after the command) is a frame number, a time
 * in seconds, or `first`/`last` (see {@link parseWhen}).
 *
 * Without `--split`, the spec is resolved against the *combined* timeline of
 * the selected scenes (e.g. `last` = the project's final frame), producing one
 * file. With `--split`, the spec is resolved *per scene* against each scene's
 * own timeline (e.g. `first` = each scene's frame 0), producing one file per
 * scene — mirroring `export --split`.
 *
 * Files are named with the same base-name workflow as `export` (scene name for
 * a per-scene/single capture, project name for a combined multi-scene one),
 * suffixed with `_<frame>` and the format extension — e.g. `intro_42.png`.
 */
async function runScreenshot(projectRoot: string, args: minimist.ParsedArgs): Promise<void> {
    const sceneNames = parseScenes(args.scenes);
    const split = Boolean(args.split);
    const scale = args.scale !== undefined ? Number(args.scale) : 1;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`Invalid --scale value: ${args.scale}`);
    }
    const { format, ext } = parseFormat(args.format);

    // Validate the frame/time positional (argv._[0] is the command) up front, so
    // a bad spec fails immediately rather than after a browser spin-up. A `<time>`
    // can't be resolved to a frame yet (needs fps), so it's resolved post-start.
    const when = parseWhen(args._[1]);

    const outDir = path.resolve(
        projectRoot,
        typeof args.out === 'string' ? args.out : DEFAULT_OUT_DIR,
        SCREENSHOT_SUBDIR,
    );

    const driver = new HeadlessDriver(projectRoot);
    try {
        await driver.start();
        const projectName = await driver.projectName();

        // fps lives in the project config; the CLI needs it to convert a
        // `<time>` spec into a frame (frame/first/last resolve without it).
        const fps = await driver.fps();
        const frame = resolveFrameSpec(when, fps);

        const selected = sceneNames ? sceneNames.join(', ') : 'all scenes';
        console.log(
            kleur.bold('Screenshot ') + kleur.dim(`of ${selected}`) +
            (split ? kleur.dim(' (split — per scene)') : '') +
            (scale !== 1 ? kleur.dim(` @ ${scale}x`) : ''),
        );

        fs.mkdirSync(outDir, { recursive: true });

        // Capture one frame and write it. For split this runs once per scene
        // (sceneName set); otherwise once for the combined timeline (sceneName
        // null → the multi-scene capture is named after the project).
        const captureOne = async (sceneName: string | null) => {
            const result = await driver.screenshot({
                // A per-scene capture targets just that scene; the combined
                // capture passes the (possibly filtered) selection through.
                sceneNames: sceneName ? [sceneName] : sceneNames,
                frame,
                scale,
                format,
            });
            const base = buildBaseName(projectName, sceneName);
            const dest = path.join(outDir, `${base}_${result.frame}.${ext}`);
            fs.writeFileSync(dest, result.bytes);

            const sizeKb = (result.bytes.length / 1024).toFixed(1);
            const timeAtFrame = (result.frame / fps).toFixed(2);
            console.log(
                `  ${kleur.green('✓')} ${path.relative(projectRoot, dest)} ` +
                kleur.dim(`(frame ${result.frame} / ${result.totalFrames}, ${timeAtFrame}s, ${sizeKb} KB)`),
            );
        };

        if (split) {
            // One file per scene: the selected scenes (in project order), or all
            // scenes when no --scenes filter is given.
            const all = await driver.listScenes();
            const targets = sceneNames ?? all;
            if (targets.length === 0) {
                console.log(kleur.yellow('No scenes to screenshot.'));
                return;
            }
            for (const name of targets) {
                await captureOne(name);
            }
        } else {
            // Combined: a single selected scene is still "one scene", so name it
            // after that scene (matches export); a genuine multi-scene capture
            // falls back to the project name (null).
            const single = sceneNames && sceneNames.length === 1 ? sceneNames[0] : null;
            await captureOne(single);
        }
    } finally {
        await driver.close();
    }
}

/**
 * Delete every file in `dir` whose extension is in `exts`, returning the names
 * removed. Touches only matching files (never the directory or unrelated files,
 * and never recurses), so it's safe to run in a dir that keeps other things.
 * A missing directory yields an empty list.
 */
function clearByExt(dir: string, exts: ReadonlySet<string>): string[] {
    if (!fs.existsSync(dir)) return [];
    const removed: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
        fs.rmSync(path.join(dir, entry.name));
        removed.push(entry.name);
    }
    return removed;
}

/**
 * `ms clear` — remove exported videos and screenshots from the output
 * directory. Deletes only video files from `out/videos` and image files from
 * `out/screenshots` (never the directories or unrelated files), so it's safe to
 * run in a project that keeps other things in `out/`. No browser/Vite needed.
 */
function runClear(projectRoot: string, args: minimist.ParsedArgs): void {
    const outDir = path.resolve(projectRoot, typeof args.out === 'string' ? args.out : DEFAULT_OUT_DIR);
    if (!fs.existsSync(outDir)) {
        console.log(kleur.dim(`Nothing to clear — ${path.relative(projectRoot, outDir)}/ does not exist.`));
        return;
    }

    const videoExts = new Set(['.mp4', '.webm', '.mov', '.mkv']);
    const imageExts = new Set(['.png', '.jpg', '.jpeg']);

    const videoDir = path.join(outDir, VIDEO_SUBDIR);
    const screenshotDir = path.join(outDir, SCREENSHOT_SUBDIR);
    const videos = clearByExt(videoDir, videoExts);
    const screenshots = clearByExt(screenshotDir, imageExts);

    const total = videos.length + screenshots.length;
    if (total === 0) {
        console.log(kleur.dim(`Nothing to clear in ${path.relative(projectRoot, outDir)}/.`));
        return;
    }
    for (const name of videos) {
        console.log(`  ${kleur.red('✗')} ${path.join(VIDEO_SUBDIR, name)}`);
    }
    for (const name of screenshots) {
        console.log(`  ${kleur.red('✗')} ${path.join(SCREENSHOT_SUBDIR, name)}`);
    }
    console.log(
        kleur.green(
            `Cleared ${videos.length} video(s) and ${screenshots.length} screenshot(s) ` +
            `from ${path.relative(projectRoot, outDir)}/.`,
        ),
    );
}

async function main(): Promise<void> {
    const argv = minimist(process.argv.slice(2), {
        boolean: ['split', 'help', 'version'],
        // Keep these as strings so values aren't number-coerced (e.g. an `--out`
        // dir that's all digits, or `--format jpg`). `--scale` stays unlisted so
        // it parses as a number.
        string: ['scenes', 'out', 'format'],
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
        case 'screenshot':
            await runScreenshot(projectRoot, argv);
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
