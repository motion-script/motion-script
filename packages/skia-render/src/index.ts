// @motion-script/skia-render — the backend-agnostic Skia renderer for
// @motion-script/core.
//
// This package knows how to turn core's render descriptors into Skia draw calls:
// shapes, fills, strokes, text/paragraph layout, SkSL effects, the 3D reconciler,
// and the per-frame export orchestration. It talks to the CanvasKit JS API and to
// `@motion-script/core`, and to nothing else.
//
// Everything platform-specific is injected rather than imported:
//
//   - surface creation          → `SkiaRenderContext.attach(surface)`
//   - image/video/audio decode  → the abstract members of `SkiaStorageAdapter`
//   - GPU texture upload        → `SkiaStorageAdapter.uploadTextureSource`
//   - video/still encoding      → `VideoFrameSink` / `ImageEncoder`
//   - audio mixing             → `AudioMixer`
//   - the 3D GL context         → `View3DHost`, via `registerView3DHost`
//
// `@motion-script/web` supplies the browser implementations (WebGL surface,
// WebCodecs/mediabunny, Web Audio, three's WebGLRenderer). A native backend —
// rust-skia over napi, or canvaskit-wasm in Node with ffmpeg — supplies its own
// and reuses everything here unchanged. That is the whole point of the split:
// there is exactly one renderer implementation, so two backends cannot drift.
//
// See eslint.config.js for the rule that enforces the boundary.
//
// ─── Import convention ───────────────────────────────────────────────────────
//
// This barrel carries only the *public* surface a backend or an end user needs.
// Everything else is reachable through the package's wildcard subpath export
// (`@motion-script/skia-render/shapes/rect`), which is what the sibling packages
// use — the same "never import the barrel from a non-barrel module" rule the
// eslint config enforces internally, applied across the package boundary so
// tree-shaking and cycle-freedom survive the split.

// ─── Effects ─────────────────────────────────────────────────────────────────

export { EffectRegistry } from "./effects/registry";
export type {
    EffectHandler,
    EffectGeometry,
    EffectResources,
    EffectTarget,
    RenderEffect,
} from "./effects/handler";

// ─── Export orchestration ────────────────────────────────────────────────────
//
// The frame loop is portable; the codec is injected. Declare a `VideoFrameSink`
// over mediabunny, ffmpeg, NVENC or anything else and `renderTimeline` drives it.

export { renderTimeline, renderFrameAt, drawFrameAt, NoopAudioDevice } from "./export";
export type {
    VideoFrameSink,
    AudioMixer,
    ImageEncoder,
    ScheduledAudioRequest,
    ScreenshotFormat,
    FrameSpec,
    RenderTimelineParams,
    RenderFrameParams,
    RenderedFrame,
    DrawFrameParams,
    DrawnFrame,
} from "./export";

// ─── The platform seam ───────────────────────────────────────────────────────

export type {
    SkiaAssets,
    SkiaTextAssets,
    SkiaImageAssets,
    SkiaVideoAssets,
    Skia3DAssets,
    SkiaTextureSource,
    DecodedPixels,
} from "./assets";

// ─── 3D ──────────────────────────────────────────────────────────────────────

export {
    View3DBackend, view3DBackend, disposeView3DBackend, view3DModule,
} from "./three/backend";
export {
    loadView3D, threeModule, registerView3DBackend,
    requestView3DWarm, warmPendingView3D, __resetView3DBridgeForTests,
} from "./three/bridge";
export { disposeTextureCache } from "./three/handlers/texture";
export {
    registerView3DRendererHost, view3DRendererHost, __resetView3DRendererHostForTests,
} from "./three/renderer-seam";
export type { ThreeModule } from "./three/bridge";
export type { View3DAssets } from "./three/handlers/texture";
export type {
    RenderedView3D, View3DRendererHost, View3DRendererSettings,
} from "./three/renderer-seam";
