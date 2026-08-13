import {
    AssetCatalog, type AssetManifest, type AudioTrack,
    type GlobalLayerConfig, type PrecompCache, type Scene, type Size2D,
} from "@motion-script/core";
import {
    renderTimeline,
    type VideoFrameSink,
} from "@motion-script/skia-render/export";
import {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_VERY_HIGH,
    type Quality,
} from 'mediabunny';
import { WebRenderContext } from "./render-context";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKit } from "./getter";
import { WebAudioMixer } from "./audio/mixer";

/** Reports export progress in [0, 1]; video encoding occupies most of the range, audio mixing/finalize the tail. */
export type ExportProgressCallback = (progress: number) => void;

/**
 * How the video track is encoded.
 *
 * Every field is a straight pass-through to mediabunny's `VideoEncodingConfig`,
 * defaulted here rather than there so an export has one obvious place to look.
 */
export type VideoEncoderOptions = {
    /**
     * Which encoder implementation WebCodecs should prefer.
     *
     * Defaults to `'no-preference'`, which lets each platform use its own
     * hardware encoder (VideoToolbox on macOS, Media Foundation/NVENC on
     * Windows, VA-API on Linux). That is typically several times faster than the
     * software path *and* it is the only configuration in which this sink's
     * zero-readback design actually holds: a software encoder needs the pixels
     * on the CPU, so it forces a full GPU→CPU copy of every frame that a
     * hardware encoder reads directly off the canvas.
     *
     * Pass `'prefer-software'` when byte-identical output across machines
     * matters more than speed — different hardware encoders tune quality and
     * colour differently at the same nominal bitrate, so the same settings do
     * not produce the same file.
     */
    hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    /**
     * Target bitrate in bits per second, or one of mediabunny's subjective
     * `Quality` levels.
     *
     * Defaults to `QUALITY_VERY_HIGH`, which resolves against the *actual*
     * output size (~12 Mbps at 1080p, ~44 Mbps at 4K). A fixed number cannot do
     * that: it is simultaneously wasteful at half scale and starved at 4×.
     */
    bitrate?: number | Quality;
    /** Defaults to mediabunny's `'variable'`. `'constant'` is the reproducible-output choice. */
    bitrateMode?: 'constant' | 'variable';
    /** Seconds between key frames. Defaults to mediabunny's 2. */
    keyFrameInterval?: number;
};

/** How the mixed audio track is encoded. */
export type AudioEncoderOptions = {
    /** AAC bitrate in bits per second. Defaults to 192 kbps. */
    bitrate?: number;
    /** Mixdown sample rate in Hz. Defaults to the mixer's own (44100). */
    sampleRate?: number;
};

const DEFAULT_AUDIO_BITRATE = 192_000;

export type ExportParams = {
    scenes: Scene[];
    viewport?: Size2D;
    fps?: number;
    scale?: number;
    filename?: string;
    manifest?: AssetManifest;
    /**
     * Project-level audio beds (`ProjectConfig.audioTracks`), mixed into the
     * exported track alongside the scenes' own audio. Bounded by the exported
     * timeline, which for a scene subset is shorter than the whole project's.
     */
    audioTracks?: AudioTrack[];
    /** Project-level nodes drawn over every exported scene (`ProjectConfig.overlays`). */
    overlays?: GlobalLayerConfig[];
    /** Project-level nodes drawn under every exported scene (`ProjectConfig.backgrounds`). */
    backgrounds?: GlobalLayerConfig[];
    /**
     * Set false to produce a silent MP4 — no AAC track is added to the
     * container and the mix is skipped entirely. Defaults to true.
     */
    includeAudio?: boolean;
    /**
     * A host store of previously-measured scene passes. Supplying one lets an
     * export skip precomp for any scene the host has already measured — see
     * `RenderTimelineParams.precompCache`.
     */
    precompCache?: PrecompCache;
    /** Video encoder settings; see {@link VideoEncoderOptions} for the defaults. */
    video?: VideoEncoderOptions;
    /** Audio encoder settings; ignored when `includeAudio` is false. */
    audio?: AudioEncoderOptions;
    onProgress?: ExportProgressCallback;
    signal?: AbortSignal;
    wasmUrl?: string;
    /**
     * When true, the encoded MP4 bytes are returned instead of triggering a
     * browser download. Used by headless drivers (e.g. the CLI) that capture
     * the output themselves and write it to disk; leave unset for the
     * interactive player, which downloads via an `<a>` element.
     */
    returnBytes?: boolean;
}

const EMPTY_MANIFEST: AssetManifest = {
    image: {},
    video: {},
    audio: {},
    font: {},
};

// ── Audio mixing ─────────────────────────────────────────────────────────────
//
// The mix itself lives in ./audio/mixer, shared with the standalone
// `AudioTimeline` so a preview and the file it exports cannot drift apart.

// ── Video sink ───────────────────────────────────────────────────────────────

/**
 * mediabunny/WebCodecs implementation of the frame sink.
 *
 * Wraps the very `<canvas>` CanvasKit draws into, so `addFrame` costs nothing but
 * a timestamp — WebCodecs pulls the pixels from the canvas itself, with no
 * GPU→CPU readback. That is why the seam signals a frame rather than passing one.
 *
 * The readback claim holds only while the encoder is a hardware one, which is
 * why {@link VideoEncoderOptions.hardwareAcceleration} defaults to letting the
 * platform choose: a software encoder has to be handed CPU pixels, so it drags
 * a full-frame copy off the GPU on every single frame.
 */
class MediabunnyVideoSink implements VideoFrameSink<AudioBuffer> {
    private readonly target = new BufferTarget();
    private readonly output: Output;
    private readonly video: CanvasSource;
    private audio: AudioBufferSource | null = null;

    constructor(
        canvas: HTMLCanvasElement,
        video: VideoEncoderOptions = {},
        private readonly audioOptions: AudioEncoderOptions = {},
    ) {
        this.video = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: video.bitrate ?? QUALITY_VERY_HIGH,
            hardwareAcceleration: video.hardwareAcceleration ?? 'no-preference',
            ...(video.bitrateMode !== undefined && { bitrateMode: video.bitrateMode }),
            ...(video.keyFrameInterval !== undefined && { keyFrameInterval: video.keyFrameInterval }),
        });
        this.output = new Output({ format: new Mp4OutputFormat(), target: this.target });
    }

    async start(info: { fps: number; hasAudio: boolean }): Promise<void> {
        this.output.addVideoTrack(this.video, { frameRate: info.fps });
        // Tracks must be declared before the muxer starts, which is why the
        // orchestrator reports this rather than leaving it to be inferred.
        if (info.hasAudio) {
            this.audio = new AudioBufferSource({
                codec: 'aac',
                bitrate: this.audioOptions.bitrate ?? DEFAULT_AUDIO_BITRATE,
            });
            this.output.addAudioTrack(this.audio);
        }
        await this.output.start();
    }

    async addFrame(timestamp: number, duration: number): Promise<void> {
        await this.video.add(timestamp, duration);
    }

    async addAudio(mixed: AudioBuffer): Promise<void> {
        if (!this.audio) return;
        await this.audio.add(mixed);
    }

    async finalize(): Promise<Uint8Array> {
        this.video.close();
        this.audio?.close();
        await this.output.finalize();
        const buffer = this.target.buffer;
        if (!buffer) throw new Error('Export produced no data');
        return new Uint8Array(buffer);
    }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders `scenes` frame-by-frame to an offscreen canvas and muxes the result
 * into an MP4 via mediabunny.
 *
 * The frame loop itself — precomp, state evaluation, the warm-and-re-render retry
 * that keeps every frame accurate, audio scheduling, progress and cancellation —
 * lives in `@motion-script/skia-render`'s `renderTimeline`. What this function
 * supplies is the browser-specific half: a canvas to draw into, a WebCodecs sink,
 * a Web Audio mixer, and the `<a download>` delivery.
 */
export async function exportScenesAsVideo(params: ExportParams): Promise<Uint8Array | void> {
    const {
        scenes,
        viewport = { width: 1920, height: 1080 },
        fps = 60,
        scale = 1,
        filename = 'export.mp4',
        manifest = EMPTY_MANIFEST,
        audioTracks,
        overlays,
        backgrounds,
        includeAudio = true,
        precompCache,
        video,
        audio = {},
        onProgress,
        signal,
        wasmUrl,
        returnBytes = false,
    } = params;

    if (scenes.length === 0) return;
    signal?.throwIfAborted();

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = viewport.width * scale;
    offscreenCanvas.height = viewport.height * scale;
    offscreenCanvas.style.display = 'none';
    document.body.appendChild(offscreenCanvas);

    const canvasKit = await getCanvasKit(wasmUrl);
    const assetCatalog = new AssetCatalog(manifest);
    const storageAdapter = new WebStorageAdapter(canvasKit, assetCatalog, viewport, fps);
    const renderContext = new WebRenderContext(canvasKit, storageAdapter);
    renderContext.mount(offscreenCanvas);

    let bytes: Uint8Array | undefined;
    try {
        bytes = await renderTimeline<AudioBuffer>({
            scenes, viewport, fps, scale, manifest, audioTracks, overlays, backgrounds,
            includeAudio, precompCache,
            renderContext, storageAdapter, assetCatalog,
            sink: new MediabunnyVideoSink(offscreenCanvas, video, audio),
            mixer: new WebAudioMixer(audio.sampleRate),
            onProgress,
            signal,
        }) as Uint8Array | undefined;
    } finally {
        renderContext.dispose();
        document.body.removeChild(offscreenCanvas);
    }

    if (!bytes) return;

    // Headless callers capture the bytes and write them to disk themselves,
    // so skip the DOM-based download path entirely.
    if (returnBytes) return bytes;

    // The sink builds this Uint8Array over a whole, plain ArrayBuffer, so the cast
    // is sound — TS only balks because the generic parameter admits a
    // SharedArrayBuffer, which a BlobPart may not be.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
