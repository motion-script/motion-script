// @motion-script/engine — render Motion Script projects from Node.
//
// You pass in the objects `createProject` and `createScene` return; the engine
// renders them in-process on CanvasKit's CPU rasterizer. No project directory,
// no config file, no bundler, no browser, no GPU.
//
//     const engine = createEngine({ fonts: [{ family: 'Inter', path: './Inter.ttf' }] });
//     const still  = await engine.renderImage({ project, at: 'last' });
//     const video  = await engine.renderVideo({ project, sink });   // sink: your own VideoFrameSink
//     const clips  = await engine.renderClips({ project });

export { MotionScriptEngine, createEngine } from './engine.js';

export {
    EngineError,
    isEngineError,
    type EngineErrorCode,
} from './errors.js';

export {
    parseFrameSelector,
    toFrameSpec,
    type FrameSelector,
    type FrameSpec,
    type ParsedFrame,
} from './frame.js';

// Option parsers, exported because a service validating a request body wants
// the same rules the engine applies — and wants them to fail at the edge with
// INVALID_OPTION rather than mid-render.
export {
    parseBitrate,
    parseCodec,
    parseImageFormat,
    parseScale,
    parseSupersample,
    parseTimeout,
    type ResolvedImageFormat,
} from './validate.js';

// The renderer's Node bindings, for a host that wants to drive
// `@motion-script/skia-render` itself rather than through the engine.
export { NodeRenderContext, type NodeRenderBackend, type RenderContextFactory } from './render-context.js';
export { NodeStorageAdapter, type AssetLoader, type ImageDecoder } from './storage-adapter.js';
export { getCanvasKit } from './canvaskit.js';
export { encodePng } from './png.js';

// Re-exported so a custom `EngineOptions.createRenderContext` or
// `RenderVideoOptions.sink` can be typed against these without a direct
// dependency on `@motion-script/skia-render`.
export type { VideoFrameSink, AudioMixer } from '@motion-script/skia-render/export';

export type {
    AssetResolver,
    ClipProgress,
    EngineLogger,
    EngineOptions,
    FontSource,
    ImageFormat,
    JobOptions,
    RenderClipsOptions,
    RenderImageOptions,
    RenderSource,
    RenderVideoOptions,
    RenderedClip,
    RenderedImage,
    RenderedVideo,
    VideoCodec,
    VideoEncodeOptions,
    VideoProgress,
} from './types.js';
