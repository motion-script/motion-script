import { AssetManager, AssetCatalog, AssetManifest, MeasureScope, Precomp, Scene, Size2D, StateEvaluator, AudioDevice, AudioRequest } from "@motion-script/core"
import { WebRenderContext } from "./render-context";
import { WebStorageAdapter } from "./storage-adapter";
import { getCanvasKit } from "./getter";

const EMPTY_MANIFEST: AssetManifest = {
    image: {},
    video: {},
    audio: {},
    font: {},
};

/** Image formats a screenshot can be encoded to. */
export type ScreenshotFormat = "png" | "jpeg";

/**
 * How the requested frame is addressed: an explicit global frame index, the
 * timeline's first frame, or its last. The CLI resolves `[time]` to a frame
 * (round(time * fps)) before calling, so only frame-addressed specs reach here.
 */
export type FrameSpec =
    | { kind: "frame"; frame: number }
    | { kind: "first" }
    | { kind: "last" };

export type ScreenshotParams = {
    scenes: Scene[];
    viewport?: Size2D;
    fps?: number;
    scale?: number;
    manifest?: AssetManifest;
    wasmUrl?: string;
    /** Which frame to capture (see {@link FrameSpec}). */
    frame: FrameSpec;
    /** Encoding format (default "png"). */
    format?: ScreenshotFormat;
    /** JPEG quality in [0,1] (ignored for png; default 0.92). */
    quality?: number;
};

export type ScreenshotResult = {
    /** The actual global frame that was captured (after clamping/resolution). */
    frame: number;
    /** Total frames in the timeline, so callers can validate / report. */
    totalFrames: number;
    /** Encoded image bytes. */
    bytes: Uint8Array;
};

/**
 * Audio is irrelevant to a still capture, but `AssetManager` needs an
 * `AudioDevice`-shaped sink, so feed it a no-op one (mirrors the exporter).
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

/** Decode a `data:` URL's base64 payload into raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Renders a single frame of `scenes` to an image, reusing the exact same
 * {@link Precomp}/{@link StateEvaluator}/{@link WebRenderContext} pipeline as
 * {@link exportScenesAsVideo} — so a screenshot is the same render the user
 * previews and exports, just captured at one frame.
 *
 * Returns the captured frame index (after clamping the requested spec to the
 * valid range), the total frame count, and the encoded image bytes.
 */
export async function exportScreenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const {
        scenes,
        viewport = { width: 1920, height: 1080 },
        fps = 60,
        scale = 1,
        manifest = EMPTY_MANIFEST,
        wasmUrl,
        frame,
        format = "png",
        quality = 0.92,
    } = params;

    if (scenes.length === 0) throw new Error("No scenes to screenshot.");

    const resolution: Size2D = {
        width: viewport.width * scale,
        height: viewport.height * scale,
    };

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = resolution.width;
    offscreenCanvas.height = resolution.height;
    offscreenCanvas.style.display = "none";
    document.body.appendChild(offscreenCanvas);

    const canvasKit = await getCanvasKit(wasmUrl);
    const assetCatalog = new AssetCatalog(manifest);
    const storageAdapter = new WebStorageAdapter(canvasKit, assetCatalog, viewport, fps);
    const renderContext = new WebRenderContext(canvasKit, storageAdapter);
    renderContext.mount(offscreenCanvas);
    renderContext.pixelRatio = scale;

    try {
        const precomp = new Precomp(
            scenes,
            viewport,
            fps,
            assetCatalog,
            renderContext as unknown as MeasureScope,
        ).run();

        const { totalFrames } = precomp;
        if (totalFrames === 0) throw new Error("Timeline has no frames to capture.");

        // Resolve the spec to a concrete global frame, then clamp into range.
        const requested =
            frame.kind === "first" ? 0
                : frame.kind === "last" ? totalFrames - 1
                    : frame.frame;
        const targetFrame = Math.max(0, Math.min(totalFrames - 1, Math.floor(requested)));

        const tracks = precomp.scenes.map(s => s.frameCount);
        const stateEvaluator = new StateEvaluator(scenes, viewport, fps, assetCatalog, tracks);
        const assetManager = new AssetManager(precomp, storageAdapter, new NoopAudioDevice());

        // stateAt replays from the owning scene's start to reach a mid-timeline
        // frame, so a single still is correct without a frame-by-frame pass.
        await assetManager.loadAt(targetFrame);
        stateEvaluator.stateAt(targetFrame);
        stateEvaluator.layout(renderContext as unknown as MeasureScope);
        await renderContext.execute(() => {
            stateEvaluator.render(renderContext);
        });

        const mime = format === "jpeg" ? "image/jpeg" : "image/png";
        const dataUrl = renderContext.screenshot(mime, quality);
        if (!dataUrl) throw new Error("Screenshot capture produced no data.");

        stateEvaluator.dispose();

        return { frame: targetFrame, totalFrames, bytes: dataUrlToBytes(dataUrl) };
    } finally {
        renderContext.dispose();
        document.body.removeChild(offscreenCanvas);
    }
}
