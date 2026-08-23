import type {
    AssetManifest,
    GlobalLayerConfig,
    ProjectConfig,
    Scene,
    Size2D,
    Theme,
    Variables,
} from '@motion-script/core';
import type { FrameSelector } from './frame.js';

/** Video codecs the encoder can be asked for. */
export type VideoCodec = 'avc' | 'hevc' | 'av1' | 'vp9';

/** Image formats a still can be encoded as. `'jpg'` is accepted as an alias of `'jpeg'`. */
export type ImageFormat = 'png' | 'jpeg' | 'jpg';

/**
 * Where the engine writes diagnostics. Every method is optional and the default
 * is silent: a library embedded in a server must never decide on its own to
 * print to stdout.
 */
export interface EngineLogger {
    debug?(message: string): void;
    info?(message: string): void;
    warn?(message: string): void;
    error?(message: string): void;
}

/**
 * A font to make available to every render.
 *
 * Unlike a browser, Node has no system fonts and no fallback face — an
 * unregistered family shapes to nothing and its text simply does not appear. So
 * fonts are given to the engine rather than discovered, and a family named in a
 * scene must be one of these.
 */
export interface FontSource {
    /** The family name scenes refer to, e.g. `'Inter'`. */
    family: string;
    /** Path to a font file. Give this or {@link data}. */
    path?: string;
    /** Font bytes, when they come from somewhere other than disk. */
    data?: Uint8Array;
    /**
     * The weight this file is. Registering several weights of one family lets
     * the shaper pick the closest for any requested weight, which is what makes
     * `fontWeight` tween-able. Defaults to 400.
     */
    weight?: number;
}

/** Reads an asset's bytes for a `src` a scene refers to. */
export type AssetResolver = (src: string) => Promise<Uint8Array>;

/** Settings for the engine as a whole. What to render is passed per call. */
export interface EngineOptions {
    /** Fonts available to every render. See {@link FontSource}. */
    fonts?: FontSource[];
    /**
     * Where a non-font asset `src` resolves from: a directory to read relative
     * paths against, or a function that returns the bytes itself (an object
     * store, a database, a cache).
     */
    assets?: string | AssetResolver;
    /**
     * Extra asset metadata, merged over what the engine derives from `fonts`.
     * Only needed for media the renderer must know the size or duration of
     * before it loads.
     */
    manifest?: Partial<AssetManifest>;
    /**
     * Default wall-clock budget per job, in milliseconds. `0` disables it.
     * Default 15 minutes; override per call with `timeout`.
     */
    timeout?: number;
    /**
     * Path to an `ffmpeg` binary. Needed for video output and for decoding
     * image assets, which Node cannot do on its own. Defaults to `ffmpeg` on
     * `PATH`.
     */
    ffmpegPath?: string;
    /** Viewport used when a render passes scenes without a project. Defaults to 1920×1080. */
    viewport?: Size2D;
    /** Frame rate used when a render passes scenes without a project. Defaults to 60. */
    fps?: number;
    /** Diagnostics sink. Default: silent. */
    logger?: EngineLogger;
}

/**
 * What to render: a project, or scenes on their own.
 *
 * Both are the objects `createProject` and `createScene` return — there is no
 * project directory, no config file and no build step. Passing a `project` is
 * the usual case; passing `scenes` renders exactly those, taking the project's
 * settings when one is also given and the engine's defaults otherwise. To
 * render part of a project, filter its scenes:
 *
 * ```ts
 * await engine.renderVideo({ project, scenes: project.scenes.slice(0, 2) });
 * ```
 */
export interface RenderSource {
    /** The project to render, from `createProject(...)`. */
    project?: ProjectConfig;
    /** Scenes to render. Overrides `project.scenes` when both are given. */
    scenes?: Scene | Scene[];
    /** Output size. Falls back to the project's, then the engine's, then 1920×1080. */
    viewport?: Size2D;
    /** Frame rate. Falls back to the project's, then the engine's, then 60. */
    fps?: number;
    /** Colour tokens and typography presets. Falls back to the project's. */
    theme?: Theme;
    /** Project constants read via `stage.variables(...)`. Falls back to the project's. */
    variables?: Variables;
    /** Nodes drawn over every scene. Falls back to the project's. */
    overlays?: GlobalLayerConfig[];
    /** Nodes drawn under every scene. Falls back to the project's. */
    backgrounds?: GlobalLayerConfig[];
}

/** Cancellation and time budget, on every render call. */
export interface JobOptions {
    /**
     * Cancels the job. A render checks the signal between frames, so
     * cancellation lands within a frame rather than immediately.
     */
    signal?: AbortSignal;
    /** Overrides the engine's default `timeout` for this job, in ms. `0` disables it. */
    timeout?: number;
}

/** Encoding settings shared by the two video calls. */
export interface VideoEncodeOptions {
    /** Resolution multiplier applied to the viewport. Default `1`. */
    scale?: number;
    /** Video codec. Default `'avc'` (H.264). */
    codec?: VideoCodec;
    /** Bitrate in bits per second; `'40M'` and `'12000k'` are accepted. Default: resolution- and fps-aware. */
    bitrate?: number | string;
    /**
     * Render each frame at this multiple of the output size and downsample
     * before encoding, which softens the colour fringing 4:2:0 chroma puts on
     * saturated edges — at n² the render cost. Default `1`.
     */
    supersample?: number;
}

/** Options for {@link MotionScriptEngine.renderVideo} — one video, scenes concatenated. */
export interface RenderVideoOptions extends RenderSource, JobOptions, VideoEncodeOptions {
    /** Reports encode progress as it runs. */
    onProgress?(progress: VideoProgress): void;
}

/** Options for {@link MotionScriptEngine.renderClips} — one video per scene. */
export interface RenderClipsOptions extends RenderSource, JobOptions, VideoEncodeOptions {
    /** Reports progress as it runs, per scene. */
    onProgress?(progress: ClipProgress): void;
    /**
     * Called once per finished clip, the moment its encode completes — so a long
     * run can be uploaded or written one scene at a time instead of being held
     * whole in memory. Awaited before the next scene starts.
     */
    onClip?(clip: RenderedClip): void | Promise<void>;
    /**
     * Keep every clip in the resolved array. Default `true`. Set `false`
     * alongside `onClip` to stream a long run out — the array is then empty.
     */
    collect?: boolean;
}

export interface VideoProgress {
    /** Progress through the video, in `[0, 1]`. */
    progress: number;
}

export interface ClipProgress {
    /** The scene being rendered. */
    scene: Scene;
    /** Its name, or a positional fallback when scenes are unnamed. */
    name: string;
    /** Its index in the selection. */
    index: number;
    /** Progress through this clip, in `[0, 1]`. */
    progress: number;
}

/** One video covering the selected scenes, concatenated in order. */
export interface RenderedVideo {
    /** The scenes it covers, in order. */
    scenes: Scene[];
    /** Frames encoded. */
    frames: number;
    /** Duration in seconds. */
    duration: number;
    /** Encoded MP4 bytes. */
    bytes: Uint8Array;
}

/** One video covering exactly one scene. */
export interface RenderedClip {
    /** The scene this clip covers. Always a scene — that is the point of `renderClips`. */
    scene: Scene;
    /** `scene.name`, or a positional fallback when scenes are unnamed. Safe as a filename. */
    name: string;
    /** Its index in the selection, so output can be ordered without matching on names. */
    index: number;
    frames: number;
    duration: number;
    /** Encoded MP4 bytes. */
    bytes: Uint8Array;
}

export interface RenderImageOptions extends RenderSource, JobOptions {
    /** Which frame to capture. Default `'last'`. */
    at?: FrameSelector;
    /** Resolution multiplier applied to the viewport. Default `1`. */
    scale?: number;
    /** Image format. Default `'png'`. */
    format?: ImageFormat;
    /** JPEG quality in `[0,1]`; ignored for PNG. Default `0.92`. */
    quality?: number;
}

export interface RenderedImage {
    /** The frame actually captured, after clamping the request into range. */
    frame: number;
    /** That frame's position on the timeline, in seconds. */
    time: number;
    /** Frames in the measured timeline — only the real total when `measuredAll`. */
    totalFrames: number;
    /**
     * True when every selected scene was measured. Capturing an early frame
     * stops as soon as the owning scene is measured, so `totalFrames` covers
     * only that prefix.
     */
    measuredAll: boolean;
    /** The format the bytes are encoded in. */
    format: 'png' | 'jpeg';
    /** Encoded image bytes. */
    bytes: Uint8Array;
}
