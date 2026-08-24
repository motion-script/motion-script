import fs from 'node:fs/promises';
import path from 'node:path';
import type { CanvasKit } from '@motion-script/canvaskit';
import {
    setTheme,
    setVariables,
    type AssetManifest,
    type FontMeta,
    type Scene,
    type Size2D,
} from '@motion-script/core';
import { renderFrameAt, renderTimeline, type VideoFrameSink } from '@motion-script/skia-render/export';
import { getCanvasKit } from './canvaskit.js';
import { withDeadline } from './deadline.js';
import { EngineError } from './errors.js';
import { parseFrameSelector, toFrameSpec } from './frame.js';
import { encodePng } from './png.js';
import { Semaphore } from './semaphore.js';
import { RenderWorker } from './worker.js';
import { parseImageFormat, parseScale, parseTimeout } from './validate.js';
import type {
    AssetResolver,
    EngineOptions,
    FontSource,
    RenderImageOptions,
    RenderSource,
    RenderVideoOptions,
    RenderedImage,
    RenderedVideo,
} from './types.js';

/** Default per-job budget: long enough for a real render, short enough to not wedge a queue forever. */
const DEFAULT_JOB_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_VIEWPORT: Size2D = { width: 1920, height: 1080 };
const DEFAULT_FPS = 60;
const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

/** What a render actually needs, after a source has been reconciled with the engine's defaults. */
interface ResolvedSource {
    scenes: Scene[];
    viewport: Size2D;
    fps: number;
    theme: RenderSource['theme'];
    variables: RenderSource['variables'];
    overlays: RenderSource['overlays'];
    backgrounds: RenderSource['backgrounds'];
}

/**
 * Renders Motion Script projects to images and video, in-process.
 *
 * You hand it the objects `createProject` and `createScene` return — there is
 * no project directory, no config file, no bundler and no browser. Rendering
 * runs on CanvasKit's CPU rasterizer, so it needs no GPU, no display and no
 * driver, and produces identical pixels wherever it runs.
 *
 * ```ts
 * const engine = createEngine({ fonts: [{ family: 'Inter', path: './Inter.ttf' }] });
 *
 * const project = createProject({ name: 'Promo', scenes: [intro, outro] });
 * const still = await engine.renderImage({ project, at: 'last' });
 * const video = await engine.renderVideo({ project, sink: myFfmpegSink });
 * const clips = await engine.renderClips({ project });
 * ```
 *
 * `renderVideo` has no built-in encoder — see {@link RenderVideoOptions.sink} —
 * so `myFfmpegSink` above is a `VideoFrameSink` (from
 * `@motion-script/skia-render/export`) the caller supplies, typically piping
 * `SkiaRenderContext.snapshotPixels()` to an `ffmpeg` process over stdin.
 *
 * ### Renders are serialized
 *
 * One render runs at a time and the rest queue. This is not a tuning choice:
 * Node is single-threaded and a CanvasKit render blocks it, so overlapping
 * renders would interleave rather than parallelize — and the theme and variable
 * registries scenes resolve against are process-global, so two renders of
 * differently-themed projects would read each other's tokens. Scale out with
 * more processes, not more engines.
 */
export class MotionScriptEngine {
    private readonly options: EngineOptions;
    private readonly defaultTimeout: number;
    /** One render at a time — see the note on the class. */
    private readonly permits = new Semaphore(1);
    private readonly loadAsset: AssetResolver;
    private readonly manifest: AssetManifest;
    private canvasKit: CanvasKit | null = null;
    private starting: Promise<CanvasKit> | null = null;
    private worker: RenderWorker | null = null;
    private closed = false;

    constructor(options: EngineOptions = {}) {
        this.options = options;
        this.defaultTimeout = parseTimeout(options.timeout, DEFAULT_JOB_TIMEOUT_MS);
        const built = buildManifest(options);
        this.manifest = built.manifest;
        this.loadAsset = resolveAssetLoader(options.assets, built.inline);
    }

    /** Whether CanvasKit is loaded and a render surface exists. */
    get started(): boolean {
        return this.canvasKit !== null;
    }

    /**
     * Load CanvasKit and register the configured fonts. Idempotent, and
     * concurrent callers share one start — so the render calls simply await it
     * and a server need not sequence its own warm-up.
     */
    async start(): Promise<void> {
        await this.ready();
    }

    private ready(): Promise<CanvasKit> {
        if (this.closed) throw new EngineError('CLOSED', 'The engine was closed.');
        if (this.canvasKit) return Promise.resolve(this.canvasKit);
        this.starting ??= getCanvasKit()
            .then(ck => { this.canvasKit = ck; this.starting = null; return ck; })
            .catch((err: unknown) => { this.starting = null; throw err; });
        return this.starting;
    }

    /**
     * Render a single frame to a PNG or JPEG.
     *
     * `at` addresses the combined timeline of the scenes being rendered, so
     * `{ at: 'last' }` is the project's final frame while
     * `{ scenes: [intro], at: 'last' }` is that scene's.
     */
    async renderImage(options: RenderImageOptions = {}): Promise<RenderedImage> {
        // Validated before queueing: a bad selector should fail immediately
        // rather than after waiting behind a long render.
        const parsed = parseFrameSelector(options.at ?? 'last');
        const { format } = parseImageFormat(options.format);
        const scale = parseScale(options.scale);
        const source = this.resolveSource(options);

        if (format === 'jpeg') {
            throw new EngineError(
                'INVALID_OPTION',
                'JPEG output is not supported yet — this backend encodes PNG. Request png.',
            );
        }

        return this.run(options, async worker => {
            worker.prepare(source.viewport, scale);
            const frame = toFrameSpec(parsed, source.fps);

            // Theme and variables are process-global registries the scene
            // resolves tokens against, so they are applied per render rather
            // than once at construction. Safe because renders are serialized —
            // see the note on the class.
            setTheme(source.theme);
            setVariables(source.variables);

            const result = await renderFrameAt({
                scenes: source.scenes,
                viewport: source.viewport,
                fps: source.fps,
                scale,
                manifest: this.manifest,
                overlays: source.overlays,
                backgrounds: source.backgrounds,
                renderContext: worker.renderContext,
                storageAdapter: worker.storageAdapter,
                assetCatalog: worker.assetCatalog,
                frame,
                format,
                encoder: { encode: (pixels, width, height) => encodePng(pixels, width, height) },
            });

            return {
                frame: result.frame,
                time: result.frame / source.fps,
                totalFrames: result.totalFrames,
                measuredAll: result.measuredAll,
                format,
                bytes: result.bytes,
            };
        });
    }

    /**
     * Render scenes to video, driving `options.sink` frame by frame.
     *
     * There is no built-in encoder — see {@link RenderVideoOptions.sink} for why
     * the caller supplies one. Everything else (precomp, state evaluation, asset
     * windows, the warm-and-re-render retry that makes a frame accurate, audio
     * scheduling, progress, cancellation) is the portable machinery
     * `@motion-script/skia-render`'s `renderTimeline` drives regardless of what
     * encodes the result — the same split `@motion-script/web`'s browser exporter
     * is built on, with a mediabunny/WebCodecs sink in its place.
     */
    async renderVideo(options: RenderVideoOptions): Promise<RenderedVideo> {
        const scale = parseScale(options.scale);
        const source = this.resolveSource(options);

        return this.run(options, async worker => {
            worker.prepare(source.viewport, scale);
            setTheme(source.theme);
            setVariables(source.variables);

            // `renderTimeline` only reports frame count and fps to the sink's
            // `start` — captured here rather than measuring the timeline a second
            // time to fill in `RenderedVideo`.
            let frames = 0;
            let fps = source.fps;
            const addAudio = options.sink.addAudio?.bind(options.sink);
            const sink: VideoFrameSink = {
                start: async info => {
                    frames = info.totalFrames;
                    fps = info.fps;
                    await options.sink.start(info);
                },
                addFrame: options.sink.addFrame.bind(options.sink),
                addAudio,
                finalize: options.sink.finalize.bind(options.sink),
            };

            const bytes = await renderTimeline({
                scenes: source.scenes,
                viewport: source.viewport,
                fps: source.fps,
                scale,
                manifest: this.manifest,
                overlays: source.overlays,
                backgrounds: source.backgrounds,
                renderContext: worker.renderContext,
                storageAdapter: worker.storageAdapter,
                assetCatalog: worker.assetCatalog,
                sink,
                mixer: options.mixer,
                includeAudio: options.includeAudio,
                onProgress: options.onProgress ? progress => options.onProgress!({ progress }) : undefined,
                signal: options.signal,
            });

            return {
                scenes: source.scenes,
                frames,
                duration: fps > 0 ? frames / fps : 0,
                bytes: bytes ?? undefined,
            };
        });
    }

    /** Release CanvasKit's surface and every cached decode. The engine cannot be reused. */
    async close(): Promise<void> {
        this.closed = true;
        this.permits.drain(new EngineError('CLOSED', 'The engine was closed.'));
        this.worker?.dispose();
        this.worker = null;
    }

    /**
     * Reconcile a source with the project it names and the engine's defaults.
     *
     * `scenes` wins over `project.scenes` so a caller can render part of a
     * project — filtering the objects it already holds — without restating the
     * viewport, theme and layers that go with it.
     */
    private resolveSource(source: RenderSource): ResolvedSource {
        const project = source.project;
        const raw = source.scenes ?? project?.scenes ?? [];
        const scenes = Array.isArray(raw) ? raw : [raw];
        if (scenes.length === 0) {
            throw new EngineError(
                'INVALID_OPTION',
                'Nothing to render — pass `project` or `scenes`.',
            );
        }
        return {
            scenes,
            viewport: source.viewport ?? project?.viewport ?? this.options.viewport ?? DEFAULT_VIEWPORT,
            fps: source.fps ?? project?.fps ?? this.options.fps ?? DEFAULT_FPS,
            theme: source.theme ?? project?.theme,
            variables: source.variables ?? project?.variables,
            overlays: source.overlays ?? project?.overlays,
            backgrounds: source.backgrounds ?? project?.backgrounds,
        };
    }

    /**
     * Queue a job, give it the shared render worker, and hold it to the
     * caller's time budget and cancellation.
     */
    private async run<T>(
        options: { signal?: AbortSignal; timeout?: number },
        job: (worker: RenderWorker) => Promise<T>,
    ): Promise<T> {
        if (this.closed) throw new EngineError('CLOSED', 'The engine was closed.');
        const canvasKit = await this.ready();
        const timeout = parseTimeout(options.timeout, this.defaultTimeout);

        await this.permits.acquire(options.signal);
        try {
            if (this.closed) throw new EngineError('CLOSED', 'The engine was closed.');
            this.worker ??= new RenderWorker(
                canvasKit,
                {
                    manifest: this.manifest,
                    loadAsset: this.loadAsset,
                    logger: this.options.logger,
                },
                this.options.viewport ?? DEFAULT_VIEWPORT,
            );
            return await withDeadline(job(this.worker), options.signal, timeout);
        } finally {
            this.permits.release();
        }
    }
}

/** Construct a rendering engine. CanvasKit loads on first use, or eagerly via `start()`. */
export function createEngine(options: EngineOptions = {}): MotionScriptEngine {
    return new MotionScriptEngine(options);
}

/**
 * Turn the `assets` setting into a loader.
 *
 * A directory is the common case and reads relative to it; a function lets the
 * bytes come from anywhere (an object store, a database, a cache), which is the
 * point of not tying the engine to a filesystem layout.
 */
function resolveAssetLoader(
    assets: EngineOptions['assets'],
    inline: ReadonlyMap<string, Uint8Array>,
): AssetResolver {
    const fromDisk = typeof assets === 'function' ? assets : null;
    const root = typeof assets === 'string' ? assets : process.cwd();
    return async (src: string) => {
        // Bytes handed to the engine directly never touch the filesystem, and
        // are checked before the caller's own resolver so an inline font cannot
        // be shadowed by a same-named file.
        const bytes = inline.get(src);
        if (bytes) return bytes;
        if (fromDisk) return fromDisk(src);
        if (/^https?:\/\//i.test(src)) {
            const response = await fetch(src);
            if (!response.ok) {
                throw new EngineError('RENDER_FAILED', `Could not fetch asset "${src}": HTTP ${response.status}.`);
            }
            return new Uint8Array(await response.arrayBuffer());
        }
        try {
            // Strip a leading slash so a scene written for a web `public/` folder
            // ("/logo.png") reads from the asset root rather than the filesystem root.
            return new Uint8Array(await fs.readFile(path.resolve(root, src.replace(/^\//, ''))));
        } catch (err) {
            throw new EngineError(
                'RENDER_FAILED',
                `Could not read asset "${src}" from ${root}: ` +
                (err instanceof Error ? err.message : String(err)),
                { cause: err },
            );
        }
    };
}

/**
 * Build the asset manifest the catalog reads, from the engine's `fonts` plus
 * any manifest the caller supplied.
 *
 * Fonts get first-class treatment because Node has no system faces: a family a
 * scene names must be described here or its text renders nothing at all. Font
 * entries are keyed `family@weight`, which is what lets several weights of one
 * family register together and make `fontWeight` tween-able.
 */
function buildManifest(options: EngineOptions): {
    manifest: AssetManifest;
    inline: Map<string, Uint8Array>;
} {
    const font: Record<string, FontMeta> = { ...options.manifest?.font };
    const inline = new Map<string, Uint8Array>();
    for (const source of options.fonts ?? []) {
        const weight = source.weight ?? 400;
        const src = fontSrc(source, inline);
        font[`${source.family}@${weight}`] = {
            fontFamily: source.family,
            fontWeight: weight,
            src,
            // Only used for load budgeting, which this backend does not do.
            sizeBytes: source.data?.byteLength ?? 0,
        };
    }
    return {
        manifest: {
            image: { ...EMPTY_MANIFEST.image, ...options.manifest?.image },
            video: { ...EMPTY_MANIFEST.video, ...options.manifest?.video },
            audio: { ...EMPTY_MANIFEST.audio, ...options.manifest?.audio },
            font,
        },
        inline,
    };
}

/**
 * The `src` a font resolves by. Bytes given directly are registered under a
 * synthetic key, so "a path on disk" and "bytes I already have" travel through
 * the same manifest field and the same loader.
 */
function fontSrc(source: FontSource, inline: Map<string, Uint8Array>): string {
    if (source.path) return source.path;
    if (!source.data) {
        throw new EngineError(
            'INVALID_OPTION',
            `Font "${source.family}" has neither \`path\` nor \`data\`.`,
        );
    }
    const key = `inline:${source.family}@${source.weight ?? 400}`;
    inline.set(key, source.data);
    return key;
}
