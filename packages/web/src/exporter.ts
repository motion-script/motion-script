import {
    AssetCatalog, type AssetManifest, type AudioTrack,
    type GlobalLayerConfig, type Scene, type Size2D,
} from "@motion-script/core";
import {
    renderTimeline,
    type AudioMixer,
    type ScheduledAudioRequest,
    type VideoFrameSink,
} from "@motion-script/skia-render/export";
import {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
} from 'mediabunny';
import { WebRenderContext } from "./render-context";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKit } from "./getter";
import { buildAudioFilterGraph, effectiveSpeed } from "./audio/filter-graph";

/** Reports export progress in [0, 1]; video encoding occupies most of the range, audio mixing/finalize the tail. */
export type ExportProgressCallback = (progress: number) => void;

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

/** Fetches and decodes an audio source against a scratch `OfflineAudioContext` (decoding requires a context but doesn't render through it). */
async function fetchAudioBuffer(src: string, ctx: OfflineAudioContext): Promise<AudioBuffer> {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Web Audio implementation of the mixer seam.
 *
 * Renders every scheduled request into a single timeline-length buffer via an
 * `OfflineAudioContext` graph (gain per request, looping/trimming, the same
 * filter chain the live `WebAudioDevice` builds) — done once after the full video
 * pass so the mux step gets one continuous track instead of per-frame scheduling.
 */
class WebAudioMixer implements AudioMixer<AudioBuffer> {
    async mix(
        requests: readonly ScheduledAudioRequest[],
        totalDuration: number,
        sampleRate: number = 44100,
    ): Promise<AudioBuffer | null> {
        if (requests.length === 0) return null;

        const uniqueSrcs = [...new Set(requests.map(r => r.request.src))];
        const scratchCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

        const decoded = new Map<string, AudioBuffer>();
        await Promise.all(uniqueSrcs.map(async (src) => {
            decoded.set(src, await fetchAudioBuffer(src, scratchCtx));
        }));

        const mixCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

        for (const { request: req, globalOffset } of requests) {
            const srcBuffer = decoded.get(req.src);
            if (!srcBuffer) continue;

            const globalStart = globalOffset + req.startAt;
            const globalEnd = req.endAt !== null
                ? globalOffset + req.endAt
                : totalDuration;

            const clipDuration = Math.min(globalEnd - globalStart, totalDuration - globalStart);
            if (clipDuration <= 0) continue;

            const source = mixCtx.createBufferSource();
            source.buffer = srcBuffer;
            source.loop = req.loop;

            const rate = effectiveSpeed(req.filters);
            if (rate !== 1) source.playbackRate.value = rate;

            const gain = mixCtx.createGain();
            gain.gain.value = req.volume;

            // Filter chain sits between the source and the per-request gain, matching
            // the live WebAudioDevice graph so exports sound identical to preview.
            const graph = buildAudioFilterGraph(mixCtx, source, req.filters ?? []);
            graph.output.connect(gain);
            gain.connect(mixCtx.destination);

            // start()'s 3rd arg is a source-buffer duration, so a sped-up clip consumes
            // proportionally more buffer over the same span of scene time.
            source.start(globalStart, req.trimStart, clipDuration * rate);
            for (const osc of graph.oscillators) osc.start(globalStart);
        }

        return mixCtx.startRendering();
    }
}

// ── Video sink ───────────────────────────────────────────────────────────────

/**
 * mediabunny/WebCodecs implementation of the frame sink.
 *
 * Wraps the very `<canvas>` CanvasKit draws into, so `addFrame` costs nothing but
 * a timestamp — WebCodecs pulls the pixels from the canvas itself, with no
 * GPU→CPU readback. That is why the seam signals a frame rather than passing one.
 */
class MediabunnyVideoSink implements VideoFrameSink<AudioBuffer> {
    private readonly target = new BufferTarget();
    private readonly output: Output;
    private readonly video: CanvasSource;
    private audio: AudioBufferSource | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.video = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: 10_000_000,
            // Pin to the software encoder with fixed rate control so every platform
            // produces the same output. Without this, WebCodecs' `no-preference`
            // default lets each OS pick its own HW encoder (VideoToolbox on macOS,
            // Media Foundation/NVENC on Windows), which have different quality/
            // color tuning at the same nominal bitrate — same settings, different
            // result.
            hardwareAcceleration: 'prefer-software',
            bitrateMode: 'constant',
        });
        this.output = new Output({ format: new Mp4OutputFormat(), target: this.target });
    }

    async start(info: { fps: number; hasAudio: boolean }): Promise<void> {
        this.output.addVideoTrack(this.video, { frameRate: info.fps });
        // Tracks must be declared before the muxer starts, which is why the
        // orchestrator reports this rather than leaving it to be inferred.
        if (info.hasAudio) {
            this.audio = new AudioBufferSource({ codec: 'aac', bitrate: 192_000 });
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
            renderContext, storageAdapter, assetCatalog,
            sink: new MediabunnyVideoSink(offscreenCanvas),
            mixer: new WebAudioMixer(),
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
