// @motion-script/web — CanvasKit/Skia-based renderer for @motion-script/core,
// running in the browser (canvas mount, video export, audio playback/clock).

export { WebRenderContext } from "./render-context";
export { WebStorageAdapter } from "./storage-adapter";
export { getCanvasKit } from "./getter";
// Re-exported from @motion-script/skia-render, whose canonical home these are —
// kept on this barrel so the specifier consumers already use keeps resolving.
export { EffectRegistry } from "@motion-script/skia-render";
export type { EffectHandler, EffectGeometry, EffectResources, EffectTarget, RenderEffect } from "@motion-script/skia-render";
export {
    exportScenesAsVideo,
    type ExportParams,
    type ExportProgressCallback,
    type VideoEncoderOptions,
    type AudioEncoderOptions,
} from "./exporter";
// mediabunny's resolution-aware quality levels, re-exported so a host can pick
// one for `ExportParams.video.bitrate` without taking a direct dependency on the
// encoder library this package happens to use.
export {
    QUALITY_VERY_LOW,
    QUALITY_LOW,
    QUALITY_MEDIUM,
    QUALITY_HIGH,
    QUALITY_VERY_HIGH,
    type Quality,
} from "mediabunny";
export { exportScreenshot, type ScreenshotParams, type ScreenshotResult, type ScreenshotFormat, type FrameSpec } from "./screenshot";
// Single frames as a first-class capability: one long-lived renderer that repaints
// into a canvas the host owns, for thumbnails and still previews. `exportScreenshot`
// above is the one-shot wrapper over it.
export { StillRenderer, createStillRenderer } from "./still";
export type {
    StillRendererOptions,
    RenderStillOptions,
    EncodeStillOptions,
    StillSource,
    FrameRef,
} from "./still";
export { WebAudioDevice as WebAudioPlayer } from "./audio/player";
// Stacked-audio playback and mixdown. Also on the `@motion-script/web/audio`
// subpath, which is the import to prefer — it reaches these without loading
// CanvasKit, since none of it draws.
export { AudioTimeline, createAudioTimeline } from "./audio/timeline";
export type { AudioTimelineOptions, MixdownOptions } from "./audio/timeline";
export { mixAudio, encodeWav, type MixAudioOptions } from "./audio/mixer";
export { WebMeasureScope } from "./measure-scope";
export { WebMasterClock } from "./master-clock";

// ─── 3D ──────────────────────────────────────────────────────────────────────

// The reconciler, handlers and lazy `three` boundary all live in
// @motion-script/skia-render now; this package supplies only the WebGL renderer
// that rasterizes what they build. Re-exported here so the specifiers consumers
// already use keep resolving.
export { View3DBackend, view3DBackend, loadView3D, disposeView3DBackend } from "@motion-script/skia-render";
export type { View3DAssets, RenderedView3D } from "@motion-script/skia-render";

import { registerView3DBackend, registerView3DRendererHost } from "@motion-script/skia-render";
import { webView3DRendererHost } from "./three/renderer";

// Hand core the three-loading hook so `View3D.prepareRender()` can preload the
// runtime during precomp, before any frame draws. Done at module scope rather
// than lazily because core has no way to reach into this package on its own — the
// registration is the seam.
//
// Note this package declares `sideEffects: false`, which is still accurate: the
// call has no observable effect for a 2D-only project (it just stores a function
// reference), and because it lives in the barrel every consumer imports, a
// bundler can't drop it while keeping anything else here.
registerView3DBackend();

// Hand skia-render the WebGL renderer, for the same reason and with the same
// constraint: it MUST be registered from this barrel.
//
// `./three/renderer` is no longer statically imported by anything else in this
// package — the reconciler that used to import it moved out. Combined with
// `sideEffects: false`, a module-scope registration inside that file could be
// tree-shaken away, and the failure is silent: `view3DBackend()` returns null
// forever, the warm-and-retry loop exhausts its three passes, and every frame
// ships its 2D parts with no 3D and no error. Registering here keeps the module
// reachable and the behaviour explicit.
registerView3DRendererHost(webView3DRendererHost);
