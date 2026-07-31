import type { AssetManifest, GlobalLayerConfig, Scene, Size2D, Theme, Variables } from "@motion-script/core";
import type { FrameSpec, ScreenshotFormat } from "@motion-script/skia-render/export";
import { createStillRenderer, type FrameRef, type StillSource } from "./still";

export type { ScreenshotFormat, FrameSpec };

export type ScreenshotParams = {
    scenes: Scene[];
    viewport?: Size2D;
    fps?: number;
    scale?: number;
    manifest?: AssetManifest;
    /** Project theme, applied before the frame builds so color tokens resolve. */
    theme?: Theme;
    /** Project variables, readable in scene generators via `stage.variables(...)`. */
    variables?: Variables;
    /** Project-level nodes drawn over every scene (`ProjectConfig.overlays`). */
    overlays?: GlobalLayerConfig[];
    /** Project-level nodes drawn under every scene (`ProjectConfig.backgrounds`). */
    backgrounds?: GlobalLayerConfig[];
    wasmUrl?: string;
    /** Which frame to capture. Defaults to the timeline's first. */
    frame?: FrameRef;
    /** Encoding format (default "png"). */
    format?: ScreenshotFormat;
    /** JPEG quality in [0,1] (ignored for png; default 0.92). */
    quality?: number;
};

export type ScreenshotResult = {
    /** The actual global frame that was captured (after clamping/resolution). */
    frame: number;
    /**
     * Frames in the measured timeline. Capturing an early frame measures only the
     * scenes up to the one owning it, so this is the project's total **only when
     * {@link measuredAll} is true** — a `"last"` capture always is.
     */
    totalFrames: number;
    /** True when every scene was measured, so {@link totalFrames} is the real total. */
    measuredAll: boolean;
    /** Encoded image bytes. */
    bytes: Uint8Array;
};

/**
 * Renders a single frame of `scenes` to an image.
 *
 * A one-shot wrapper over {@link StillRenderer}: create, render, encode, dispose.
 * It therefore takes the same path as a live preview, and as the video export at
 * that frame — there is one renderer, not three.
 *
 * For anything that captures **repeatedly** — a thumbnail builder, a preview that
 * repaints as the user edits — hold a {@link StillRenderer} instead. This function
 * builds and tears down a WebGL surface per call, which is the right trade for one
 * capture and the wrong one for a hundred.
 */
export async function exportScreenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const {
        scenes, viewport, fps, scale, manifest, theme, variables,
        overlays, backgrounds, wasmUrl,
        frame, format = "png", quality = 0.92,
    } = params;

    if (scenes.length === 0) throw new Error("No scenes to screenshot.");

    const renderer = await createStillRenderer({
        viewport, fps, scale, manifest, theme, variables, overlays, backgrounds, wasmUrl,
    });

    try {
        const drawn = await renderer.render(scenes as StillSource, { frame });
        return { ...drawn, bytes: await renderer.toBytes({ format, quality }) };
    } finally {
        renderer.dispose();
    }
}
