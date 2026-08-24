import {
    ManifestAssetCatalog,
    Precomp,
    ProjectGlobals,
    type AssetManifest,
    type AudioTrack,
    type GlobalLayerConfig,
    type PrecompCache,
    type Scene,
    type Size2D,
} from "@motion-script/core";
import { collectAudio } from "@motion-script/skia-render/export";

import { mixAudio } from "./audio/mixer";
import { getCanvasKit } from "./getter";
import { WebMeasurer } from "./measurer";
import { WebStorageAdapter } from "./storage-adapter";

export interface MixTimelineAudioParams {
    scenes: Scene[];
    viewport?: Size2D;
    fps?: number;
    manifest?: AssetManifest;
    audioTracks?: AudioTrack[];
    overlays?: GlobalLayerConfig[];
    backgrounds?: GlobalLayerConfig[];
    /** Measurements already paid for elsewhere; see {@link PrecompCache}. */
    precompCache?: PrecompCache;
    /** Mixdown rate. Defaults to the mixer's own (44100). */
    sampleRate?: number;
    wasmUrl?: string;
}

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

/**
 * Mix a timeline's audio without rendering a single frame.
 *
 * `exportScenesAsVideo` normally does this as part of the render, and for a
 * single-threaded export that is exactly right. A **split** export cannot: its
 * video is rendered in pieces by separate workers, and concatenating
 * separately-encoded AAC puts the encoder's priming delay at every join — a click
 * at each scene boundary and a track that drifts further out of sync with every
 * one. So the coordinator mixes the whole timeline once, here, and the joined
 * file gets a single continuous audio track.
 *
 * Returns `null` when the timeline schedules no audio at all, which is the common
 * case and not a failure — the caller should then mux video only rather than
 * declare an empty track.
 *
 * ## Why this measures
 *
 * Audio requests are an *output of the precomp*: a sound's start time is decided
 * by the generator that also drives the visuals, so there is no way to know what
 * plays when without driving it. That is why `precompCache` matters here more
 * than almost anywhere — handed the editor's store, this is nearly free; without
 * one it re-measures every scene.
 *
 * Nothing is drawn, so this takes a {@link WebMeasurer} rather than a render
 * context: it needs to *measure* text (layout decides how long a scene is, and
 * therefore when the scene after it starts), not rasterize it. No canvas, no
 * surface, no GPU.
 */
export async function mixTimelineAudio(
    params: MixTimelineAudioParams,
): Promise<AudioBuffer | null> {
    const {
        scenes,
        viewport = { width: 1920, height: 1080 },
        fps = 60,
        manifest = EMPTY_MANIFEST,
        audioTracks,
        overlays,
        backgrounds,
        precompCache,
        sampleRate,
        wasmUrl,
    } = params;

    if (scenes.length === 0) return null;

    // CanvasKit only for its font manager — `WebMeasurer` shapes text through
    // it, and a scene's length depends on how that text laid out.
    const canvasKit = await getCanvasKit(wasmUrl);
    const catalog = new ManifestAssetCatalog(manifest);
    const storage = new WebStorageAdapter(canvasKit, catalog, viewport, fps);
    const measurer = new WebMeasurer(storage);
    const globals = new ProjectGlobals({ audioTracks, overlays, backgrounds }, viewport);

    try {
        const precomp = new Precomp(scenes, viewport, fps, catalog, measurer, {
            globals,
            cache: precompCache,
            // Same reasoning as the exporter's own pass: nothing here draws a
            // timeline, and a partial pass must not be written back to a store the
            // editor shares.
            lifespans: false,
        }).run();

        const scheduled = collectAudio(precomp, fps);
        if (scheduled.length === 0) return null;

        return await mixAudio(scheduled, precomp.totalDuration, { sampleRate });
    } finally {
        // The adapter holds decode sessions and cached images; without this a mix
        // leaks them for the life of the page.
        storage.dispose();
    }
}
