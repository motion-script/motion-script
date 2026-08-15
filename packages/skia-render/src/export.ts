import {
    AssetCatalog, AssetManager, AudioDevice, type AudioRequest, type AssetManifest,
    type GlobalLayerConfig, type AudioTrack, Measurer, Precomp, type PrecompCache,
    type PrecompResult, ProjectGlobals, type Scene, type Size2D, StateEvaluator,
    type StorageAdapter, yieldToScheduler,
} from "@motion-script/core";
import type { SkiaAssets } from "./assets";
import type { SkiaRenderContext } from "./render-context";

/**
 * Rendering a timeline is portable; *encoding* it is not.
 *
 * Everything about driving the frames — precomp, state evaluation, asset windows,
 * the bounded warm-and-re-render retry that makes a frame accurate, audio
 * scheduling, progress, cancellation — is the same work whatever the output
 * format. Only the codec differs, so it is injected: `@motion-script/web` supplies
 * a mediabunny/WebCodecs sink, a Node backend an ffmpeg one, and neither this
 * module nor anything below it depends on an encoder at all.
 */

/** Image formats a still can be encoded to. */
export type ScreenshotFormat = "png" | "jpeg";

/**
 * How a requested frame is addressed: an explicit global frame index, the
 * timeline's first frame, or its last.
 */
export type FrameSpec =
    | { kind: "frame"; frame: number }
    | { kind: "first" }
    | { kind: "last" };

/** One scheduled audio request, with the absolute time its scene starts at. */
export interface ScheduledAudioRequest {
    request: AudioRequest;
    /**
     * Seconds to add to the request's own times. Scene audio is scene-relative so
     * this is the scene's start; project-level beds are already absolute and take
     * **zero** — getting that backwards produces an export that looks right and
     * drifts out of sync, which no pixel comparison catches.
     */
    globalOffset: number;
}

/**
 * Where finished frames go.
 *
 * `TAudio` ties the sink to its {@link AudioMixer}: what a mixer produces is
 * platform-specific (a Web Audio `AudioBuffer`, interleaved PCM, a temp file) and
 * only its own sink consumes it, so this module relays it without naming it.
 */
export interface VideoFrameSink<TAudio = unknown> {
    /**
     * Called once before the first frame, with the resolved output geometry.
     *
     * `hasAudio` is here rather than left for the sink to infer because a muxer
     * generally has to declare its tracks before writing any, and whether the
     * timeline schedules any audio is only known after precomp — which happens
     * inside the orchestrator, after the sink was constructed.
     */
    start(info: {
        width: number;
        height: number;
        fps: number;
        totalFrames: number;
        hasAudio: boolean;
    }): Promise<void>;

    /**
     * One frame has been drawn and the surface flushed. Times are in seconds.
     *
     * **Deliberately does not receive pixels.** A browser sink wraps the canvas
     * CanvasKit already drew into and lets WebCodecs pull from it directly, with no
     * readback; handing a buffer here instead would force a full GPU→CPU
     * `readPixels` on every frame of every export. A sink that *does* need bytes
     * (ffmpeg over stdin) reads them itself, because it holds the render target it
     * was constructed with. Do not "simplify" this signature.
     */
    addFrame(timestamp: number, duration: number): Promise<void>;

    /** Mixed audio for the whole timeline, if any was produced. */
    addAudio?(mixed: TAudio): Promise<void>;

    /** Finish the container. Returns encoded bytes, or nothing if the sink delivered them itself. */
    finalize(): Promise<Uint8Array | void>;
}

/** Mixes every scheduled request into one timeline-length buffer. */
export interface AudioMixer<TAudio = unknown> {
    mix(requests: readonly ScheduledAudioRequest[], totalDuration: number): Promise<TAudio | null>;
}

/** Encodes raw unpremultiplied RGBA8888 pixels as image bytes. */
export interface ImageEncoder {
    encode(
        pixels: Uint8Array,
        width: number,
        height: number,
        format: ScreenshotFormat,
        quality?: number,
    ): Uint8Array;
}

/**
 * Audio is mixed offline at the end of a run (or irrelevant, for a still), so the
 * `AssetManager` just needs an `AudioDevice`-shaped sink that does nothing during
 * the per-frame pass.
 */
export class NoopAudioDevice extends AudioDevice {
    /** Nothing here records a request, so `AssetManager` can skip the whole sync. */
    override get schedulesAudio(): boolean { return false; }

    has(_src: string): boolean { return true; }
    async append(_src: string, _data: ArrayBuffer): Promise<void> { }
    retain(_keep: ReadonlySet<string>): void { }
    schedule(_requests: readonly AudioRequest[]): void { }
    syncTo(_sceneTime: number): void { }
    play(_time: number, _speed: number, _reverse: boolean): void { }
    stop(): void { }
}

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

/** The platform pieces both entry points need. */
interface RenderHarness {
    renderContext: SkiaRenderContext;
    /** The same adapter the context was built with; `warmPendingVideo` lives on core's base. */
    storageAdapter: StorageAdapter & SkiaAssets;
    assetCatalog: AssetCatalog;
}

/** Fields shared by the video and still entry points. */
interface CommonParams extends RenderHarness {
    scenes: Scene[];
    viewport: Size2D;
    fps: number;
    manifest?: AssetManifest;
    overlays?: GlobalLayerConfig[];
    backgrounds?: GlobalLayerConfig[];
    /**
     * A host store of previously-measured scene passes, letting an unchanged
     * scene skip its build pass entirely.
     *
     * Worth supplying whenever the caller has already measured these scenes for
     * something else — an editor that renders a live preview has, and precomp
     * costs roughly a render frame per frame, so an export that reuses it does
     * about half the work. The host owns validity; see {@link PrecompCache}.
     *
     * Entries are keyed by `Scene.__sceneHotId`, so a scene without one is
     * measured every time rather than risking one scene's timings being served
     * for another.
     */
    precompCache?: PrecompCache;
}

/**
 * How many times a frame may be re-rendered to pick up assets the first pass
 * discovered it needed (an exact video frame outside the warm window, a 3D scene
 * whose runtime hadn't loaded). Bounded because decoding is monotonic — the second
 * pass renders from a warm cache — and an unbounded loop on a broken asset would
 * hang an export rather than degrade it.
 */
const WARM_PASSES = 3;

/** Draw one frame, warming and re-rendering until it is accurate. See {@link WARM_PASSES}. */
async function renderWarmFrame(
    { renderContext, storageAdapter }: RenderHarness,
    draw: () => void,
): Promise<void> {
    for (let pass = 0; pass < WARM_PASSES; pass++) {
        await renderContext.execute(draw);
        if (!(await storageAdapter.warmPendingVideo())) break;
    }
}

/**
 * Measure only as much of the timeline as `frame` needs.
 *
 * A still at frame *f* has no use for the scenes after the one owning *f*, and
 * measuring a scene costs roughly a render frame per frame (see
 * `Precomp.precompScene`). The exception is `last`, which cannot be located
 * without measuring everything.
 *
 * Scenes past the stopping point come back as zero-length placeholders, so
 * `totalFrames` covers only the measured prefix — which is exactly what the
 * caller's clamp needs. Either the loop stopped early, in which case the target
 * is inside the prefix and below `totalFrames`; or it ran out of scenes, in
 * which case `totalFrames` is the true total and clamping to it is right.
 */
function precompUpTo(precomper: Precomp, frame: FrameSpec): PrecompResult {
    if (frame.kind === "last") return precomper.run();

    const target = frame.kind === "first" ? 0 : Math.max(0, Math.floor(frame.frame));
    let measured = 0;
    return precomper.runUntil((_index, scene) => {
        measured += scene.frameCount;
        return measured > target;
    });
}

interface PrepareOptions {
    audioTracks?: AudioTrack[];
    /** Measure only up to the scene owning this frame; omit to measure everything. */
    upTo?: FrameSpec;
}

/** Build the precomp + evaluator pair both entry points drive. */
function prepare(params: CommonParams, options: PrepareOptions = {}) {
    const { scenes, viewport, fps, assetCatalog, renderContext, overlays, backgrounds, precompCache } = params;
    // One instance, shared by the measuring pass and the render pass — the layers
    // whose assets precomp registers must be the ones the frames actually draw.
    const globals = new ProjectGlobals({ audioTracks: options.audioTracks, overlays, backgrounds }, viewport);
    const measureScope = renderContext as unknown as Measurer;

    const precomper = new Precomp(scenes, viewport, fps, assetCatalog, measureScope, {
        globals,
        cache: precompCache,
        // Neither entry point here draws a timeline, so the per-frame lifespan walk
        // (a full tree traversal allocating a path string per node) measures
        // something nothing downstream reads. Turning it off also stops these
        // partial passes being written back to `precompCache`, which an editor
        // sharing that store would otherwise read as "this scene has no nodes".
        lifespans: false,
    });
    const precomp = options.upTo ? precompUpTo(precomper, options.upTo) : precomper.run();
    const tracks = precomp.scenes.map(s => s.frameCount);
    const stateEvaluator = new StateEvaluator(
        scenes, viewport, fps, assetCatalog, tracks, measureScope, globals,
    );
    return { precomp, stateEvaluator, measureScope };
}

/**
 * Collect every audio request with the absolute offset it plays at.
 *
 * Scene requests are scene-relative and take their scene's start; project beds are
 * already in absolute timeline time and take zero. See {@link ScheduledAudioRequest.globalOffset}.
 *
 * Exported because a **split** export has to mix its audio somewhere other than
 * alongside its frames: the video is rendered in pieces by separate workers, and
 * concatenating separately-encoded AAC would put the encoder's priming delay at
 * every join. The coordinator mixes once over the whole timeline instead — and
 * must schedule it exactly as this does. A second implementation that drifted by
 * a scene offset would produce a file that plays perfectly and is out of sync.
 */
export function collectAudio(precomp: ReturnType<Precomp["run"]>, fps: number): ScheduledAudioRequest[] {
    const out: ScheduledAudioRequest[] = [];
    for (const scene of precomp.scenes) {
        const globalOffset = scene.startFrame / fps;
        for (const request of scene.audioRequests) out.push({ request, globalOffset });
    }
    for (const request of precomp.globalAudio) out.push({ request, globalOffset: 0 });
    return out;
}

export interface RenderTimelineParams<TAudio> extends CommonParams {
    scale?: number;
    audioTracks?: AudioTrack[];
    sink: VideoFrameSink<TAudio>;
    mixer?: AudioMixer<TAudio>;
    /**
     * Set false to render a silent file: no mix, and no audio track declared on
     * the container at all.
     *
     * Distinct from muting. The scenes' audio is still *precomped* — a sound is
     * scheduled by the same generator that drives the visuals, so skipping that
     * would change the frames — it simply is not encoded.
     */
    includeAudio?: boolean;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
}

/**
 * Drive every frame of `scenes` into `sink`, then mix audio and finalize.
 *
 * The caller owns the render context and its surface — this neither creates nor
 * disposes them, because how a surface comes to exist is exactly the thing that
 * differs between backends.
 */
export async function renderTimeline<TAudio>(
    params: RenderTimelineParams<TAudio>,
): Promise<Uint8Array | void> {
    const { fps, scale = 1, viewport, sink, mixer, onProgress, signal, audioTracks, includeAudio = true } = params;
    const harness: RenderHarness = params;
    const { renderContext, storageAdapter } = harness;

    if (params.scenes.length === 0) return;
    signal?.throwIfAborted();

    renderContext.pixelRatio = scale;
    const { precomp, stateEvaluator, measureScope } = prepare(
        { ...params, manifest: params.manifest ?? EMPTY_MANIFEST }, { audioTracks },
    );

    const { totalFrames, totalDuration } = precomp;
    const assetManager = new AssetManager(precomp, storageAdapter, new NoopAudioDevice());
    const scheduled = collectAudio(precomp, fps);
    const wantsAudio = includeAudio && scheduled.length > 0 && mixer !== undefined;

    await sink.start({
        width: viewport.width * scale,
        height: viewport.height * scale,
        fps,
        totalFrames,
        hasAudio: wantsAudio,
    });

    const frameDuration = 1 / fps;
    let globalTime = 0;
    // An export is the most perfectly monotonic forward walk of a timeline there
    // is — exactly the access pattern an adapter's look-ahead decode window is
    // built for. Left at the default (`false`, i.e. "paused") every video frame
    // instead takes the random-access branch: a seek + decode the render has to
    // wait on, followed by a *second* full render of the frame once it lands (see
    // `renderWarmFrame`). Telling the adapter we are playing turns that into one
    // sequential decode pass per clip.
    //
    // Restored in the `finally` so a cancelled export doesn't leave an adapter the
    // caller still owns believing a playhead is running.
    storageAdapter.setPlaying(true);
    try {
        for (let f = 0; f < totalFrames; f++) {
            signal?.throwIfAborted();

            await assetManager.loadAt(f);
            stateEvaluator.stateAt(f);
            stateEvaluator.layout(measureScope);
            await renderWarmFrame(harness, () => stateEvaluator.render(renderContext));

            await sink.addFrame(globalTime, frameDuration);
            globalTime += frameDuration;
            // Video occupies most of the range; the audio mix and finalize are the tail.
            onProgress?.(((f + 1) / totalFrames) * (wantsAudio ? 0.85 : 1));

            // Hand the host back its event loop periodically so a long export stays
            // interruptible. Core's yield is feature-detected and prefers a real
            // macrotask over a clamped setTimeout, in the browser and in Node alike.
            if ((f + 1) % 4 === 0) await yieldToScheduler();
        }
    } finally {
        storageAdapter.setPlaying(false);
    }

    if (wantsAudio) {
        const mixed = await mixer!.mix(scheduled, totalDuration);
        if (mixed !== null && sink.addAudio) await sink.addAudio(mixed);
        onProgress?.(0.97);
    }

    const bytes = await sink.finalize();
    onProgress?.(1);
    stateEvaluator.dispose();
    return bytes;
}

export interface DrawFrameParams extends CommonParams {
    scale?: number;
    frame: FrameSpec;
}

export interface DrawnFrame {
    /** The frame actually drawn, after clamping the request into range. */
    frame: number;
    /**
     * Frames in the timeline that was measured.
     *
     * **Only the project's total when {@link measuredAll} is true.** Drawing an
     * early frame measures only the scenes up to the one owning it (see
     * {@link precompUpTo}), so this covers that prefix — don't present it as a
     * timeline length without checking.
     */
    totalFrames: number;
    /**
     * True when every scene was measured, so {@link totalFrames} is the real
     * total. False when the pass stopped early.
     */
    measuredAll: boolean;
}

/**
 * Draw one frame of `scenes` into the caller's render context and leave it on
 * the surface.
 *
 * Same precomp/evaluator/warm-retry path as {@link renderTimeline}, so a still is
 * the same render the video would produce at that frame — `stateAt` replays from
 * the owning scene's start, so no frame-by-frame pass is needed.
 *
 * Split out from {@link renderFrameAt} because *what happens to the frame* varies
 * while the drawing does not: a screenshot encodes it, a live preview leaves it
 * on a visible canvas and draws the next one over it. The context is the
 * caller's throughout — this neither creates, resizes nor disposes it — so a host
 * holding one surface can call this repeatedly and keep both the surface and the
 * storage adapter's decode cache warm.
 */
export async function drawFrameAt(params: DrawFrameParams): Promise<DrawnFrame> {
    const { scale = 1, frame } = params;
    const harness: RenderHarness = params;
    const { renderContext, storageAdapter } = harness;

    if (params.scenes.length === 0) throw new Error("No scenes to render.");

    renderContext.pixelRatio = scale;
    const { precomp, stateEvaluator, measureScope } = prepare(
        { ...params, manifest: params.manifest ?? EMPTY_MANIFEST },
        { upTo: frame },
    );

    try {
        const { totalFrames } = precomp;
        if (totalFrames === 0) throw new Error("Timeline has no frames to capture.");

        const requested =
            frame.kind === "first" ? 0
                : frame.kind === "last" ? totalFrames - 1
                    : frame.frame;
        const targetFrame = Math.max(0, Math.min(totalFrames - 1, Math.floor(requested)));

        const assetManager = new AssetManager(precomp, storageAdapter, new NoopAudioDevice());
        await assetManager.loadAt(targetFrame);
        stateEvaluator.stateAt(targetFrame);
        stateEvaluator.layout(measureScope);
        await renderWarmFrame(harness, () => stateEvaluator.render(renderContext));

        return { frame: targetFrame, totalFrames, measuredAll: precomp.complete };
    } finally {
        // The pass flushed the surface before returning, so the pixels survive the
        // tree being torn down here. In `finally` so a throw mid-draw doesn't leak
        // a live scene graph.
        stateEvaluator.dispose();
    }
}

export interface RenderFrameParams extends DrawFrameParams {
    encoder: ImageEncoder;
    format?: ScreenshotFormat;
    quality?: number;
}

export interface RenderedFrame extends DrawnFrame {
    bytes: Uint8Array;
}

/** Draw one frame of `scenes` via {@link drawFrameAt} and encode it. */
export async function renderFrameAt(params: RenderFrameParams): Promise<RenderedFrame> {
    const { encoder, format = "png", quality = 0.92, renderContext } = params;

    const drawn = await drawFrameAt(params);

    const snapshot = renderContext.snapshotPixels();
    if (!snapshot) throw new Error("Screenshot capture produced no data.");

    return {
        ...drawn,
        bytes: encoder.encode(snapshot.pixels, snapshot.width, snapshot.height, format, quality),
    };
}
