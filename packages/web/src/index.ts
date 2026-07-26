// @motion-script/web — CanvasKit/Skia-based renderer for @motion-script/core,
// running in the browser (canvas mount, video export, audio playback/clock).

export { WebRenderContext } from "./render-context";
export { WebStorageAdapter } from "./storage-adapter";
export { getCanvasKit } from "./getter";
export { EffectRegistry } from "./effects";
export type { EffectHandler, EffectGeometry, EffectTarget, RenderEffect } from "./effects";
export { exportScenesAsVideo, type ExportParams, type ExportProgressCallback } from "./exporter";
export { exportScreenshot, type ScreenshotParams, type ScreenshotResult, type ScreenshotFormat, type FrameSpec } from "./screenshot";
export { WebAudioDevice as WebAudioPlayer } from "./audio/player";
export { WebMeasureScope } from "./measure-scope";
export { WebMasterClock } from "./master-clock";

// ─── 3D ──────────────────────────────────────────────────────────────────────

export { Scene3DBackend, scene3DBackend, loadScene3D, disposeScene3DBackend } from "./three";
export type { Scene3DAssets, RenderedScene3D } from "./three";

import { registerScene3DBackend } from "./three";

// Hand core the three-loading hook so `Scene3D.prepareRender()` can preload the
// runtime during precomp, before any frame draws. Done at module scope rather
// than lazily because core has no way to reach into this package on its own — the
// registration is the seam.
//
// Note this package declares `sideEffects: false`, which is still accurate: the
// call has no observable effect for a 2D-only project (it just stores a function
// reference), and because it lives in the barrel every consumer imports, a
// bundler can't drop it while keeping anything else here.
registerScene3DBackend();
