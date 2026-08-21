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
    canEncodeVideo,
    Mp4OutputFormat,
    Output,
    type Quality,
    type VideoCodec,
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
     * Which codec the video track is encoded with. Defaults to `'avc'` (H.264),
     * which every player, editor and upload target accepts.
     *
     * `'hevc'` and `'av1'` reconstruct sharp edges far better at the same
     * bitrate, which is what a listing of syntax-highlighted code or a hairline
     * stroke is made of — worth reaching for when the file is going somewhere
     * that decodes them. Both are still 4:2:0, so they narrow the gap rather
     * than close it. Availability depends on the platform's encoders; an
     * unsupported choice falls back to `'avc'` rather than failing the export.
     */
    codec?: 'avc' | 'hevc' | 'av1' | 'vp9';
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
     * Defaults to {@link motionGraphicsBitrate}, which is deliberately *not*
     * mediabunny's `QUALITY_VERY_HIGH`: that level is frame-rate blind, so a
     * 60 fps export got the same ~12 Mbps at 1080p as a 30 fps one and paid for
     * it with ringing along every glyph edge and banding across every gradient.
     * See that function for the reasoning.
     */
    bitrate?: number | Quality;
    /** Defaults to mediabunny's `'variable'`. `'constant'` is the reproducible-output choice. */
    bitrateMode?: 'constant' | 'variable';
    /**
     * Seconds between key frames. Defaults to 1.
     *
     * Shorter than mediabunny's 2, because a frame's error is carried by every
     * inter frame that references it: on synthetic content, where a flat
     * background makes a shimmer obvious, a keyframe twice as often visibly
     * resets the drift. It also halves the seek granularity, which matters for a
     * clip an editor is going to scrub.
     */
    keyFrameInterval?: number;
    /**
     * WebCodecs performance/quality trade-off. Defaults to `'quality'`, which
     * also guarantees no frame is dropped — the only correct setting for a file
     * being written rather than streamed.
     */
    latencyMode?: 'quality' | 'realtime';
    /**
     * A hint about what the frames contain, per
     * [mst-content-hint](https://w3c.github.io/mst-content-hint/#video-content-hints).
     *
     * Defaults to `'detail'`: encoders that honour it bias towards preserving
     * sharp edges and fine texture over smoothing motion, which is what motion
     * graphics are. Ignored where it is not implemented.
     */
    contentHint?: string;
};

/**
 * Bits per pixel per frame the default bitrate is built from.
 *
 * Rendered motion graphics are the hard case for a codec tuned on camera
 * footage: hard glyph edges, large flat fields, and gradients with no sensor
 * noise to hide the quantisation in. They compress *worse* than live action at
 * the same perceived quality, not better, so the figure here is well above what
 * a streaming preset would use — this is a master being rendered once, not a
 * bitstream being pushed down a pipe.
 */
const BITS_PER_PIXEL = 0.2;
/** Floor, so a tiny viewport still gets enough bits to be legible. */
const MIN_VIDEO_BITRATE = 2_000_000;
/**
 * Ceiling. Past this the returns are gone and the levels start excluding
 * hardware decoders — 4K60 lands here, and AVC level 5.1 (which every consumer
 * device implements) tops out at 240 Mbps, well clear of it.
 */
const MAX_VIDEO_BITRATE = 100_000_000;

/**
 * The default video bitrate for an export of this size and frame rate.
 *
 * Scaling with **both** axes is the point. mediabunny's `Quality` levels scale
 * with resolution only, so doubling the frame rate halved the bits available per
 * frame while leaving the number unchanged — which is exactly the configuration
 * that produced clean stills and a mushy video from the very same renderer.
 */
export function motionGraphicsBitrate(width: number, height: number, fps: number): number {
    const raw = width * height * fps * BITS_PER_PIXEL;
    return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, raw)));
}

/** How the mixed audio track is encoded. */
export type AudioEncoderOptions = {
    /** AAC bitrate in bits per second. Defaults to 192 kbps. */
    bitrate?: number;
    /** Mixdown sample rate in Hz. Defaults to the mixer's own (44100). */
    sampleRate?: number;
};

const DEFAULT_AUDIO_BITRATE = 192_000;
/** See {@link VideoEncoderOptions.keyFrameInterval}. */
const DEFAULT_KEY_FRAME_INTERVAL = 1;
/** See {@link ExportParams.supersample}. */
const DEFAULT_SUPERSAMPLE = 2;

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
     * Render each frame at this multiple of the output resolution and downsample
     * it before encoding. **Defaults to 2**; pass 1 to turn it off.
     *
     * The one lever that improves an export at a *fixed* output size. Every
     * codec a browser can encode is 4:2:0 — colour is stored at half resolution
     * on both axes, and no bitrate buys that back — so the colour fringing along
     * a saturated glyph or a hard edge is a property of the format, not of the
     * settings. Handing the encoder an already-downsampled frame does not undo
     * the subsampling, but it does mean every chroma sample averages four real
     * pixels instead of one, which is what removes most of the crawl on fine
     * detail and much of the banding on gradients.
     *
     * Measured against a correctly-sampled reference frame of a syntax-highlighted
     * listing, `2` lands 2.7 dB closer than a 1× encode — and 1.3 dB closer than
     * an *unencoded* 1× still, which is why it is the default despite costing
     * `supersample²` times the render work per frame plus a rescale. Pass 1 when
     * turnaround matters more than the file, and note that exporting at
     * `scale: 2` is cheaper than supersampling *and* better whenever the extra
     * resolution is wanted in the file itself.
     *
     * Clamped so the render surface stays inside {@link MAX_RENDER_AXIS}, since a
     * supersampled 4K export is already drawing 8K frames.
     */
    supersample?: number;
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
        fps: number,
        /** Encoded output size, which is the canvas' own unless supersampling is on. */
        output: { width: number; height: number },
        video: VideoEncoderOptions = {},
        private readonly audioOptions: AudioEncoderOptions = {},
        codec: VideoCodec = 'avc',
    ) {
        const downsampling = output.width !== canvas.width || output.height !== canvas.height;
        this.video = new CanvasSource(canvas, {
            codec,
            // Resolved against what is actually being encoded — the *output*
            // size and the rate the frame loop will feed it — rather than
            // against a subjective level that never sees the frame rate.
            bitrate: video.bitrate ?? motionGraphicsBitrate(output.width, output.height, fps),
            hardwareAcceleration: video.hardwareAcceleration ?? 'no-preference',
            keyFrameInterval: video.keyFrameInterval ?? DEFAULT_KEY_FRAME_INTERVAL,
            latencyMode: video.latencyMode ?? 'quality',
            contentHint: video.contentHint ?? 'detail',
            ...(video.bitrateMode !== undefined && { bitrateMode: video.bitrateMode }),
            // `fit` is exact here — the supersampled canvas is a whole multiple
            // of the output — but mediabunny requires it whenever both axes are
            // given, so it is stated rather than inferred.
            ...(downsampling && { transform: { width: output.width, height: output.height, fit: 'fill' as const } }),
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

/** Round up to the nearest even integer — see the call site. */
function evenUp(n: number): number {
    const rounded = Math.round(n);
    return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Longest axis the render surface is allowed to reach.
 *
 * Supersampling multiplies the surface, not the output: a 4K export at
 * `supersample: 2` is drawing 8K frames, and the next step up asks for a
 * 15360-wide WebGL surface that most drivers will not give and none will give
 * cheaply. 8192 is the smallest `MAX_TEXTURE_SIZE` in wide circulation, so a
 * surface inside it is one every machine that can run the export at all can
 * also allocate.
 */
const MAX_RENDER_AXIS = 8192;

/**
 * How far the frame can actually be supersampled at this output size.
 *
 * Reduced rather than refused: an export that quietly renders at 1× is a
 * slightly softer file, and one that throws because the default was too
 * ambitious for a 4K project is no file at all.
 */
function fittedSupersample(requested: number, output: { width: number; height: number }): number {
    const longest = Math.max(output.width, output.height);
    let factor = Math.max(1, Math.round(requested));
    while (factor > 1 && longest * factor > MAX_RENDER_AXIS) factor--;
    return factor;
}

/**
 * The codec to actually encode with: the one asked for if this platform can
 * encode it at this size, `'avc'` otherwise.
 *
 * A better codec is the single largest quality win available on synthetic
 * content — but which ones a machine has encoders for varies by OS, browser and
 * GPU, and an export that dies at the muxer because the machine has no HEVC
 * encoder is worse than one that quietly produces H.264. AVC is not probed: it
 * is the fallback, and there is nothing to fall back to.
 */
async function resolveCodec(
    requested: VideoCodec | undefined,
    size: { width: number; height: number },
    fps: number,
): Promise<VideoCodec> {
    if (!requested || requested === 'avc') return 'avc';
    try {
        const ok = await canEncodeVideo(requested, {
            width: size.width,
            height: size.height,
            bitrate: motionGraphicsBitrate(size.width, size.height, fps),
        });
        if (ok) return requested;
    } catch {
        // A probe that throws is a probe that answered "no".
    }
    console.warn(`[motion-script] No ${requested} encoder available; exporting as H.264 instead.`);
    return 'avc';
}

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
        supersample = DEFAULT_SUPERSAMPLE,
        returnBytes = false,
    } = params;

    if (scenes.length === 0) return;
    signal?.throwIfAborted();

    // Every block-based codec works in macroblocks, so an odd dimension is
    // padded by the encoder and the padding is *not* what was drawn — it shows up
    // as a smeared or discoloured strip down one edge. Rounding up to an even
    // size instead costs at most half a pixel of centring and keeps the whole
    // frame real.
    const outputSize = {
        width: evenUp(viewport.width * scale),
        height: evenUp(viewport.height * scale),
    };
    const oversample = fittedSupersample(supersample, outputSize);
    const renderScale = scale * oversample;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = evenUp(viewport.width * renderScale);
    offscreenCanvas.height = evenUp(viewport.height * renderScale);
    offscreenCanvas.style.display = 'none';
    document.body.appendChild(offscreenCanvas);

    const canvasKit = await getCanvasKit(wasmUrl);
    const assetCatalog = new AssetCatalog(manifest);
    const storageAdapter = new WebStorageAdapter(canvasKit, assetCatalog, viewport, fps);
    const renderContext = new WebRenderContext(canvasKit, storageAdapter);
    renderContext.mount(offscreenCanvas);

    const codec = await resolveCodec(video?.codec, outputSize, fps);

    let bytes: Uint8Array | undefined;
    try {
        bytes = await renderTimeline<AudioBuffer>({
            scenes, viewport, fps, scale: renderScale, manifest, audioTracks, overlays, backgrounds,
            includeAudio, precompCache,
            renderContext, storageAdapter, assetCatalog,
            sink: new MediabunnyVideoSink(offscreenCanvas, fps, outputSize, video, audio, codec),
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
