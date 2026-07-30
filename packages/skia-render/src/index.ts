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
