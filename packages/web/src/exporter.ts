import { AudioDevice, Scene, AssetManager, MeasureScope, Size2D, AudioRequest, AssetManifest, AssetCatalog, Precomp, StateEvaluator } from "@motion-script/core"
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

// ── Audio mixing helpers ─────────────────────────────────────────────────────

/** Fetches and decodes an audio source against a scratch `OfflineAudioContext` (decoding requires a context but doesn't render through it). */
async function fetchAudioBuffer(src: string, ctx: OfflineAudioContext): Promise<AudioBuffer> {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Renders every scheduled audio request into a single timeline-length buffer
 * via an `OfflineAudioContext` graph (gain nodes for per-request volume,
 * looping/trimming per request) — done once after the full video pass so the
 * mux step gets one continuous track instead of per-frame audio scheduling.
 */
async function mixAudio(
    requests: Array<{ request: AudioRequest; globalOffset: number }>,
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

/** Hands control back to the browser between frame batches so the export doesn't block the main thread (and stays cancellable/responsive). */
function yieldToMain(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Audio for exports is mixed offline via {@link mixAudio} at the end of the
 * run, so the AssetManager just needs an AudioDevice-shaped sink that does
 * nothing during the per-frame pass.
 */
class NoopAudioDevice extends AudioDevice {
    has(_src: string): boolean { return true; }
    async append(_src: string, _data: ArrayBuffer): Promise<void> { }
    retain(_keep: ReadonlySet<string>): void { }
    schedule(_requests: readonly AudioRequest[]): void { }
    syncTo(_sceneTime: number): void { }
    play(_time: number, _speed: number, _reverse: boolean): void { }
    stop(): void { }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders `scenes` frame-by-frame to an offscreen canvas and muxes the result
 * into an MP4 via mediabunny: drives the same {@link WebRenderContext}/
 * {@link StateEvaluator} pipeline as live playback, captures each frame to the
 * video track, mixes all audio offline at the end (see {@link mixAudio}), then
 * finalizes and either triggers a browser download or returns the MP4 bytes
 * (see `returnBytes`). Honors `signal` for cancellation between frames.
 */
export async function exportScenesAsVideo(params: ExportParams): Promise<Uint8Array | void> {
    const {
        scenes,
        viewport = { width: 1920, height: 1080 },
        fps = 60,
        scale = 1,
        filename = 'export.mp4',
        manifest = EMPTY_MANIFEST,

        onProgress,
        signal,
        wasmUrl,
        returnBytes = false,
    } = params;

    if (scenes.length === 0) return;
    signal?.throwIfAborted();

    const resolution: Size2D = {
        width: viewport.width * scale,
        height: viewport.height * scale,
    };
    const frameDuration = 1 / fps;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = resolution.width;
    offscreenCanvas.height = resolution.height;
    offscreenCanvas.style.display = 'none';
    document.body.appendChild(offscreenCanvas);



    const canvasKit = await getCanvasKit(wasmUrl);
    const assetCatalog = new AssetCatalog(manifest);
    const storageAdapter = new WebStorageAdapter(canvasKit, assetCatalog, viewport, fps);
    const renderContext = new WebRenderContext(canvasKit, storageAdapter);
    renderContext.mount(offscreenCanvas);
    renderContext.pixelRatio = scale;

    const precomp = new Precomp(
        scenes,
        viewport,
        fps,
        assetCatalog,
        renderContext as unknown as MeasureScope,
    ).run();

    const { totalFrames, totalDuration } = precomp;
    const tracks = precomp.scenes.map(s => s.frameCount);

    const stateEvaluator = new StateEvaluator(scenes, viewport, fps, assetCatalog, tracks);
    const audioDevice = new NoopAudioDevice();
    const assetManager = new AssetManager(precomp, storageAdapter, audioDevice);

    // Collect audio requests with global offsets from precomp.
    const sceneRequests: Array<{ request: AudioRequest; globalOffset: number }> = [];
    for (const scene of precomp.scenes) {
        const globalOffset = scene.startFrame / fps;
        for (const req of scene.audioRequests) {
            sceneRequests.push({ request: req, globalOffset });
        }
    }

    const target = new BufferTarget();
    const videoSource = new CanvasSource(offscreenCanvas, {
        codec: 'avc',
        bitrate: 10_000_000,
    });

    const output = new Output({ format: new Mp4OutputFormat(), target });
    output.addVideoTrack(videoSource, { frameRate: fps });

    let audioSource: AudioBufferSource | null = null;
    if (sceneRequests.length > 0) {
        audioSource = new AudioBufferSource({ codec: 'aac', bitrate: 192_000 });
        output.addAudioTrack(audioSource);
    }

    await output.start();

    try {
        let globalTime = 0;
        for (let f = 0; f < totalFrames; f++) {
            signal?.throwIfAborted();

            await assetManager.loadAt(f);
            stateEvaluator.stateAt(f);
            stateEvaluator.layout(renderContext as unknown as MeasureScope);
            // Render, then warm any exact video frames the render needed but the
            // window didn't have yet and re-render, so every exported frame is
            // frame-accurate. Bounded — the second pass renders from the warm cache.
            for (let pass = 0; pass < 3; pass++) {
                await renderContext.execute(() => {
                    stateEvaluator.render(renderContext);
                });
                if (!(await storageAdapter.warmPendingVideo())) break;
            }

            await videoSource.add(globalTime, frameDuration);
            globalTime += frameDuration;
            onProgress?.((f + 1) / totalFrames * (audioSource ? 0.85 : 1));

            if ((f + 1) % 4 === 0) await yieldToMain();
        }

        videoSource.close();

        if (audioSource) {
            const mixed = await mixAudio(sceneRequests, totalDuration);
            if (mixed) {
                await audioSource.add(mixed);
            }
            audioSource.close();
            onProgress?.(0.97);
        }

        await output.finalize();
        onProgress?.(1);
    } finally {
        renderContext.dispose();
        document.body.removeChild(offscreenCanvas);
    }

    const buffer = target.buffer;
    if (!buffer) throw new Error('Export produced no data');

    // Headless callers capture the bytes and write them to disk themselves,
    // so skip the DOM-based download path entirely.
    if (returnBytes) {
        return new Uint8Array(buffer);
    }

    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
