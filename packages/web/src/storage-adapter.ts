import type { CanvasKit, Image as CKImage, Surface, TypefaceFontProvider } from "@motion-script/canvaskit";
import { AssetCatalog, StorageAdapter, type Size2D } from "@motion-script/core";
import { ALL_FORMATS, CanvasSink, Input, UrlSource, type InputVideoTrack } from "mediabunny";
import { ParagraphShapeCache } from "@motion-script/skia-render/shapes/paragraph-cache";
// Type-only three usage keeps this a real lazy boundary — see three/bridge.ts.
import { warmPendingView3D } from "@motion-script/skia-render/three/bridge";

interface CachedPixels {
    width: number;
    height: number;
    pixels: Uint8Array; // RGBA8888
}

/** A live mediabunny decode session for one video src, opened once by loadVideo. */
interface VideoSession {
    input: Input;
    sink: CanvasSink;
    /** Source duration in seconds, from the container. */
    durationSec: number;
    /** Per-frame step in source seconds, learned from the first decoded sample's duration. */
    frameStep: number;
    /** Display width/height of decoded frames (post-downscale). */
    width: number;
    height: number;
    /**
     * One persistent GPU texture-backed image, reused across frames via
     * Surface.updateTextureFromSource — so advancing the playhead is a single
     * in-place texture blit, with no CPU readback or per-frame image allocation.
     */
    textureImage: CKImage | null;
    /** Quantized timestamp currently uploaded into {@link textureImage}, or null. */
    uploadedTs: number | null;
    /** A sequential decode pass is currently running for this src. */
    decoding: boolean;
}

/**
 * A texture-backed image plus the quantized timestamp currently uploaded into it —
 * the session's own pairing, factored out so the extra playhead slots
 * ({@link WebStorageAdapter.claimVideoFrame}) reuse their textures the same way.
 */
interface VideoTextureSlot {
    image: CKImage | null;
    uploadedTs: number | null;
}

/**
 * A decoded video frame cached as an immutable {@link ImageBitmap}. Bitmaps are
 * GPU-friendly texture sources (no CPU pixel readback) and cheap to keep, so the
 * window holds a few around the playhead to absorb small back-scrubs without
 * re-decoding. The current frame is uploaded into the session's texture on use.
 */
interface DecodedVideoFrame {
    /** Start timestamp of this sample, in source seconds. */
    timestamp: number;
    bitmap: ImageBitmap;
}

/** Whether a src points at an SVG (by extension, ignoring any query/hash). */
function isSvgSrc(src: string): boolean {
    return /\.svg(?:[?#]|$)/i.test(src);
}



/**
 * Browser implementation of {@link StorageAdapter} — owns all async asset
 * decoding (images, video, audio, fonts) so the render loop can stay
 * synchronous. Caches decoded results keyed by source URL/family and exposes
 * synchronous getters (`getCKImage`, `getVideoFrame`, `getAudioBuffer`,
 * `getFontMgr`) that the render context reads during a frame, after the
 * corresponding `loadX()`/prefetch has resolved for that frame's assets.
 */
export class WebStorageAdapter extends StorageAdapter {
    private canvasKit: CanvasKit;
    private fontMgr: TypefaceFontProvider;
    private disposed: boolean = false;

    private imagePixels = new Map<string, CachedPixels>();
    private imageCKCache = new Map<string, CKImage>();

    /**
     * GPU surface the render context draws into; needed to upload decoded video
     * frames straight to texture (Surface.makeImageFromTextureSource /
     * updateTextureFromSource). Set by the render context on mount.
     */
    private surface: Surface | null = null;

    /** Open decode session per video src (opened once by loadVideo, deduped). */
    private videoSessions = new Map<string, VideoSession>();
    /** Decoded frame bitmaps per src, keyed by quantized source timestamp; bounded to the forward/back window. */
    private videoFrames = new Map<string, Map<number, DecodedVideoFrame>>();
    /**
     * Decoded past frames the Echo filter needs, kept in a SEPARATE cache so the
     * forward/back window eviction (which is centered on the current playhead)
     * never drops them — echo taps reach intentionally outside that window. Keyed
     * by quantized source timestamp; bounded by trimming to the most-recently
     * requested {@link ECHO_CACHE_LIMIT} per src.
     */
    private videoEchoFrames = new Map<string, Map<number, DecodedVideoFrame>>();
    /**
     * Last timestamp each src's playhead was asked to show, used to drive
     * sequential decoding forward and to detect direction. Updated by getVideoFrame.
     */
    private videoPlayhead = new Map<string, number>();
    /**
     * Exact `(src, timestamp)` pairs a render asked for but couldn't satisfy from
     * the warm window. A blocking caller (seek/screenshot/export) drains these via
     * {@link warmPendingVideo} and re-renders, so a single still is frame-accurate
     * without each render site knowing the per-fill playback math.
     */
    private pendingVideoFrames = new Map<string, number>();
    /**
     * Exact past timestamps the Echo filter asked for but couldn't satisfy from
     * the warm window. Unlike {@link pendingVideoFrames} (one current frame per
     * src), an echo needs several past frames at once, so this holds a set per
     * src. Drained by {@link warmPendingVideo} so screenshot/export render the
     * trail frame-accurately even when not playing (where the back-window, which
     * only fills during live playback, would otherwise hold just one frame).
     */
    private pendingEchoFrames = new Map<string, Set<number>>();
    /** In-flight echo/extra-playhead decodes, keyed `src#quantizedTs`, so callers join one seek. */
    private echoDecodes = new Map<string, Promise<void>>();
    /**
     * Quantized timestamps claimed per src during the current render pass, in claim
     * order (see {@link claimVideoFrame}): index 0 holds the session's own texture,
     * index *n* holds {@link videoAltSlots} slot *n−1*. Cleared by
     * {@link beginRenderPass}.
     */
    private videoFrameClaims = new Map<string, number[]>();
    /**
     * Extra textures per src — one per *simultaneously visible* time of that clip
     * beyond the first. Persistent and updated in place exactly like a session's
     * own texture, so a second playhead costs a blit per frame, not an allocation.
     */
    private videoAltSlots = new Map<string, VideoTextureSlot[]>();
    /**
     * Whether playback is live. When false (paused / scrubbing settled), the
     * adapter does no look-ahead prefetch — it decodes only the exact frame the
     * current render needs, so a paused clip never drains a backlog of stale
     * decode jobs onto the canvas. Toggled by the playback controller.
     */
    private playing = false;


    private audioBuffers = new Map<string, AudioBuffer>();
    private audioCtx: AudioContext | null = null;
    private fps: number;

    /** Families already registered with the font provider (registered once, all weights at once). */
    private registeredFontFamilies = new Set<string>();

    /**
     * Cache of shaped straight-text runs, so text whose string/font is unchanged
     * across frames isn't re-shaped through CanvasKit every frame (the Code node's
     * per-token-per-frame draw, plus any static {@link Text}). Owns the cached
     * Fonts; disposed with the adapter (whose {@link fontMgr} the fonts derive
     * from). See {@link ParagraphShapeCache}.
     */
    private paragraphCache = new ParagraphShapeCache();
    /**
     * Bumped whenever a new font family registers. Folded into the paragraph
     * cache key so any run shaped before its family loaded (and thus shaped with
     * a fallback face) is invalidated the moment the real family arrives.
     */
    private fontEpoch = 0;

    /**
     * Frames to keep cached in the dominant direction of motion. With a 1400×800
     * RGBA frame at ~4.5 MB, 96 frames ≈ 430 MB of GPU memory — generous but
     * bounded regardless of clip length.
     */
    private static readonly FORWARD_WINDOW_FRAMES = 96;
    /**
     * Smaller back-window — enough to absorb brief reverses without re-decoding,
     * but not so large that ping-pong loops eat all VRAM.
     */
    private static readonly BACK_WINDOW_FRAMES = 32;
    /**
     * Max distinct past frames the Echo cache holds per src. Caps the renderer's
     * MAX_ECHOES (32) with a little slack so adjacent frames' trails coexist;
     * trimmed LRU-style so an animated `delay`/`echoes` can't grow it unbounded.
     */
    private static readonly ECHO_CACHE_LIMIT = 48;
    /**
     * Max extra textures per src (see {@link videoAltSlots}) — i.e. how many
     * different times of one clip can be on screen together. Generous for a
     * comparison grid; past it the last slot is reused.
     */
    private static readonly ALT_SLOT_LIMIT = 16;

    constructor(canvasKit: CanvasKit, catalog: AssetCatalog, viewport: Size2D, fps: number) {
        super(catalog, viewport);
        this.canvasKit = canvasKit;
        this.fps = fps;
        this.fontMgr = canvasKit.TypefaceFontProvider.Make();
    }

    getCanvasKit(): CanvasKit {
        return this.canvasKit;
    }

    // ─── Image ───────────────────────────────────────────────────────────────

    /**
     * Fetches and decodes `src` to RGBA pixels (cached for later GPU upload via
     * {@link getCKImage}), no-op if already cached. SVGs are rasterized at the
     * on-screen target size so they stay crisp when scaled up (see
     * {@link rasterizeSvg}); raster formats decode via `createImageBitmap`,
     * downscaled to target when that saves memory.
     */
    async loadImage(src: string, width: number, height: number): Promise<void> {
        if (this.imagePixels.has(src)) return;

        if (isSvgSrc(src)) {
            this.imagePixels.set(src, await this.rasterizeSvg(src, width, height));
            return;
        }

        const target = this.imageTargetPixels(src, width, height);

        const response = await fetch(src);
        const blob = await response.blob();

        const bitmap = target
            ? await createImageBitmap(blob, {
                resizeWidth: target.width,
                resizeHeight: target.height,
                resizeQuality: "high",
            })
            : await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            bitmap.close();
            throw new Error(`loadImage(${src}): could not get 2d context`);
        }
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        bitmap.close();

        this.imagePixels.set(src, {
            width: canvas.width,
            height: canvas.height,
            pixels: new Uint8Array(data),
        });
    }

    /**
     * Rasterize an SVG to RGBA pixels. Unlike raster formats, SVG is vector, so
     * we render it at the size it's *drawn* on screen rather than its nominal
     * `viewBox` size — a 48×48 logo placed in a 512px box must rasterize at
     * ~512px (× devicePixelRatio) to stay sharp. `createImageBitmap` can't
     * decode SVG reliably across browsers (Chrome throws on an SVG Blob), so we
     * decode through an `HTMLImageElement`, which every browser supports.
     */
    private async rasterizeSvg(src: string, width: number, height: number): Promise<CachedPixels> {
        const response = await fetch(src);
        const text = await response.text();
        // Decode from a data URL rather than an object URL so a missing/relative
        // xmlns or external ref can't leave the <img> tainted (which would make
        // the canvas readback throw a SecurityError).
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

        const img = new Image();
        img.decoding = "sync";
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`loadImage(${src}): failed to decode SVG`));
            img.src = url;
        });

        const target = this.svgTargetPixels(width, height, img.naturalWidth, img.naturalHeight);

        const canvas = new OffscreenCanvas(target.width, target.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error(`loadImage(${src}): could not get 2d context`);
        ctx.drawImage(img, 0, 0, target.width, target.height);
        const data = ctx.getImageData(0, 0, target.width, target.height).data;

        return { width: target.width, height: target.height, pixels: new Uint8Array(data) };
    }

    private imageTargetPixels(src: string, width: number, height: number): { width: number; height: number } | null {
        let meta: { width: number; height: number };
        try { meta = this.catalog.getImageMeta(src); } catch { return null; }
        if (!meta.width || !meta.height) return null;
        if (width <= 0 && height <= 0) return null;

        const targetW = width > 0 ? Math.min(width, this.viewport.width) : 0;
        const targetH = height > 0 ? Math.min(height, this.viewport.height) : 0;

        const sx = targetW > 0 ? targetW / meta.width : 0;
        const sy = targetH > 0 ? targetH / meta.height : 0;
        const ratio = Math.max(sx, sy);
        if (ratio <= 0 || ratio >= 1) return null;

        return {
            width: Math.max(1, Math.round(meta.width * ratio)),
            height: Math.max(1, Math.round(meta.height * ratio)),
        };
    }

    /**
     * Pick the raster size for an SVG, *preserving its intrinsic aspect ratio*.
     * The decoded image must keep the SVG's true proportions so the downstream
     * fit/crop/fill shader matrix (see computeImageMatrix) can position it like
     * any raster image — if we instead stretched the SVG to the layout box here,
     * its aspect ratio would already be baked in and `fit` would be a no-op.
     *
     * We compute one uniform scale: how big the SVG renders on screen (the
     * larger of the box's two dimensions, since `fit` may letterbox but `crop`
     * may overflow), times devicePixelRatio so it stays sharp when zoomed in,
     * clamped to the viewport so a huge box can't blow up memory. That factor is
     * applied to the intrinsic width/height, keeping proportions intact.
     */
    private svgTargetPixels(
        width: number,
        height: number,
        naturalWidth: number,
        naturalHeight: number,
    ): { width: number; height: number } {
        // Fall back to a square default if the SVG declared no intrinsic size.
        const intrinsicW = naturalWidth > 0 ? naturalWidth : 300;
        const intrinsicH = naturalHeight > 0 ? naturalHeight : 300;

        const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;

        // On-screen footprint we want to be crisp at. With no layout size, render
        // at the intrinsic size (scale 1).
        const boxW = width > 0 ? Math.min(width, this.viewport.width) : 0;
        const boxH = height > 0 ? Math.min(height, this.viewport.height) : 0;
        const onScreen = Math.max(boxW, boxH);

        // Scale the longest intrinsic side up to the on-screen footprint × dpr.
        const longestIntrinsic = Math.max(intrinsicW, intrinsicH);
        const scale = onScreen > 0 ? (onScreen * dpr) / longestIntrinsic : 1;

        return {
            width: Math.max(1, Math.round(intrinsicW * scale)),
            height: Math.max(1, Math.round(intrinsicH * scale)),
        };
    }

    /** Lazily uploads cached pixels for `url` to a GPU-resident CanvasKit image, memoizing the result; returns null until {@link loadImage} has completed. */
    getCKImage(url: string): CKImage | null {
        const cached = this.imagePixels.get(url);
        if (!cached) return null;
        const existing = this.imageCKCache.get(url);
        if (existing) return existing;

        const made = this.makeCKImageFromPixels(cached.pixels, cached.width, cached.height);
        if (made) this.imageCKCache.set(url, made);
        return made;
    }

    /**
     * Decoded RGBA8888 pixels for `src`, or null until {@link loadImage} has
     * completed.
     *
     * The 3D backend needs raw bytes rather than a CanvasKit image ({@link
     * getCKImage}) because it uploads them into a WebGL texture on its own
     * context. Same cache, same decode — just a different destination.
     */
    getImagePixels(src: string): { pixels: Uint8Array; width: number; height: number } | null {
        return this.imagePixels.get(src) ?? null;
    }

    // ─── 3D compositing ──────────────────────────────────────────────────────

    /**
     * Persistent CanvasKit texture per 3D node, so a 60 fps 3D scene doesn't
     * allocate and free a GPU texture every frame.
     */
    private view3DTextures = new Map<string, CKImage>();

    /**
     * Upload a 3D renderer's canvas into a GPU-resident CanvasKit image, creating
     * the texture on first use and updating it in place afterwards — the same
     * pattern decoded video frames use ({@link uploadFrame}).
     *
     * `srcIsPremul: true` is load-bearing. three's `WebGLRenderer` defaults to
     * `premultipliedAlpha: true`, so its canvas holds premultiplied pixels; the
     * third argument defaults to *unpremultiplied*, and omitting it makes Skia
     * premultiply already-premultiplied data — which shows up as dark fringes on
     * every antialiased 3D edge.
     *
     * The returned image is owned by this adapter (keyed by node), not the caller:
     * it must NOT be deleted after the draw, or the next frame loses its texture.
     */
    upload3DFrame(
        key: string,
        source: HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
        width: number,
        height: number,
    ): CKImage | null {
        const surface = this.surface;
        if (!surface) return null;

        const info = {
            width,
            height,
            alphaType: this.canvasKit.AlphaType.Premul,
            colorType: this.canvasKit.ColorType.RGBA_8888,
            colorSpace: this.canvasKit.ColorSpace.SRGB,
        };

        let image = this.view3DTextures.get(key);

        // The buffer can grow (see the renderer's size quantisation); a texture is
        // fixed-size, so a size change needs a fresh one.
        if (image && (image.width() !== width || image.height() !== height)) {
            image.delete();
            this.view3DTextures.delete(key);
            image = undefined;
        }

        if (!image) {
            // CanvasKit's TextureSource type omits canvas elements, though the
            // underlying texImage2D upload accepts them — same cast the video path
            // makes for ImageBitmap.
            const made = surface.makeImageFromTextureSource(source as never, info, true);
            if (!made) return null;
            this.view3DTextures.set(key, made);
            return made;
        }

        surface.updateTextureFromSource(image, source as never, true);
        return image;
    }

    /** Release a 3D node's texture — called when its node is swept. */
    release3DTexture(key: string): void {
        this.view3DTextures.get(key)?.delete();
        this.view3DTextures.delete(key);
    }

    // ─── Video ───────────────────────────────────────────────────────────────

    /**
     * Receive the GPU surface so decoded video frames can upload straight to
     * texture. Called by the render context on mount/unmount. A texture-backed
     * image is only valid for the surface that made it, so swapping surfaces
     * (unmount → remount, HMR) invalidates each session's cached image; it is
     * lazily recreated against the new surface on the next frame.
     */
    setSurface(surface: Surface | null): void {
        if (surface === this.surface) return;
        for (const session of this.videoSessions.values()) {
            session.textureImage?.delete();
            session.textureImage = null;
            session.uploadedTs = null;
        }
        // Same story for the extra per-timestamp images: texture-backed, so bound
        // to the surface that made them. Rebuilt on demand against the new one.
        this.clearVideoAltSlots();
        // 3D composites are texture-backed too, so they're bound to the surface
        // that made them and must be dropped alongside the video textures.
        for (const image of this.view3DTextures.values()) image.delete();
        this.view3DTextures.clear();

        this.surface = surface;
    }

    /**
     * Toggle live-playback mode. While playing, the adapter prefetches a small
     * window ahead so frames stay warm; when paused/scrubbing it decodes only the
     * exact frame the current render needs, so pausing immediately quiesces and no
     * backlog of stale decodes drains onto the canvas. Called by the playback loop.
     */
    setPlaying(playing: boolean): void {
        this.playing = playing;
    }

    /**
     * Open a streaming decode session for `src` (deduped — runs once per clip,
     * like {@link loadImage}) and warm the first frame around `trimStart` so the
     * first synchronous render hits cache. The rest of the clip is *not* decoded
     * up front; frames stream in on-demand as {@link getVideoFrame} advances the
     * playhead, kept bounded by the forward/back window.
     */
    async loadVideo(
        src: string,
        _startFrame: number,
        _endFrame: number,
        width: number,
        height: number,
        trimStart: number = 0,
        _trimEnd?: number,
    ): Promise<void> {
        if (this.videoSessions.has(src)) return;

        const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(src) });
        const track = await input.getPrimaryVideoTrack();
        if (!track) {
            input.dispose();
            throw new Error(`loadVideo(${src}): no video track found`);
        }

        const target = this.videoTargetPixels(src, width, height);
        const sink = new CanvasSink(track, {
            // Frames are snapshotted to ImageBitmaps right after decode, so a small
            // reuse pool keeps the sink's canvas allocations flat.
            poolSize: 2,
            ...(target ? { width: target.width, height: target.height, fit: "fill" as const } : {}),
        });
        const durationSec = await input.computeDuration();
        const { frameStep, width: fw, height: fh } = await this.probeFirstFrame(track, target);

        this.videoSessions.set(src, {
            input, sink, durationSec, frameStep,
            width: fw, height: fh,
            textureImage: null, uploadedTs: null, decoding: false,
        });
        this.videoFrames.set(src, new Map());

        // Warm the entry frame so the first render after load is never empty.
        await this.decodeAt(src, trimStart);
    }

    /**
     * Synchronously return the GPU image for the frame at `timestamp` (source
     * seconds). The session keeps one texture-backed image and updates it in place
     * (Surface.updateTextureFromSource) from the decoded {@link ImageBitmap} —
     * advancing the playhead is a single GPU blit, no CPU readback and no per-frame
     * allocation. On a miss it records the exact frame (for a blocking re-render)
     * and, while playing, primes the sequential decoder; it returns the nearest
     * already-decoded frame so the picture never goes blank mid-stream.
     *
     * Because that texture is shared per src and updated in place, a *drawing*
     * caller should go through {@link claimVideoFrame}, which owns the rule for
     * what happens when one frame needs two different times of the same clip.
     */
    getVideoFrame(src: string, timestamp: number): CKImage | null {
        const session = this.videoSessions.get(src);
        const frames = this.videoFrames.get(src);
        if (!session || !frames || !this.surface) return null;
        // A video fill always carries a numeric timestamp once resolved; guard
        // against a NaN/undefined slipping in so the sync render path can't throw.
        if (!Number.isFinite(timestamp)) timestamp = 0;
        this.videoPlayhead.set(src, timestamp);

        const frame = this.nearestDecoded(frames, timestamp, session.frameStep);
        const exactKey = this.quantizeTs(timestamp, session.frameStep);
        const haveExact = !!frame && this.quantizeTs(frame.timestamp, session.frameStep) === exactKey;

        if (!haveExact) {
            // Not warm yet — let a blocking caller (seek/screenshot/export) decode it
            // and re-render. While playing, also drive the sequential decoder forward.
            this.pendingVideoFrames.set(src, timestamp);
            if (this.playing) this.driveSequentialDecode(src, timestamp);
        } else if (this.playing) {
            this.driveSequentialDecode(src, timestamp);
        }

        if (!frame) return null;
        return this.uploadFrame(src, session, frame);
    }

    /**
     * Start a render pass: forget which timestamp each clip's shared texture was
     * claimed for (see {@link claimVideoFrame}). Called by the render context
     * alongside its other per-pass brackets.
     */
    beginRenderPass(): void {
        this.videoFrameClaims.clear();
    }

    /**
     * The image to paint `src` at `timestamp` with, for one draw in the current
     * render pass. **This, not {@link getVideoFrame}, is what a fill should call.**
     *
     * A session's texture is updated in place and Skia doesn't resolve a draw until
     * the surface flushes, so two draws of the *same* clip at *different* times
     * would both sample whatever was uploaded last — one loop mode wearing
     * another's frame, or a torn read painting black. So each distinct timestamp a
     * pass asks for gets its own texture: the first claim takes the session's, the
     * rest take {@link videoAltSlots} by claim order. Two draws asking for the same
     * time share, which is the common case (one clip painted as fill + stroke +
     * text is a single claim).
     *
     * Slots are persistent and updated in place exactly like the session's own, so
     * a *scrubbing* timestamp costs one blit per frame rather than a new texture.
     * Every returned image is adapter-owned — callers keep `getVideoFrame`'s
     * do-not-delete contract, unlike the Echo path's caller-owned taps.
     *
     * Like the primary path, a time whose exact frame isn't decoded yet paints the
     * nearest decoded one rather than nothing (never blank mid-stream), registers
     * the miss for {@link warmPendingVideo} so blocking callers land it exactly,
     * and — while playing — starts the decode immediately, since the sequential
     * prefetch window only follows the *primary* playhead.
     */
    claimVideoFrame(src: string, timestamp: number): CKImage | null {
        const session = this.videoSessions.get(src);
        if (!session || !this.surface) return null;
        if (!Number.isFinite(timestamp)) timestamp = 0;

        const key = this.quantizeTs(timestamp, session.frameStep);
        let claims = this.videoFrameClaims.get(src);
        if (!claims) { claims = []; this.videoFrameClaims.set(src, claims); }

        // Already claimed for this time in this pass — reuse that texture.
        const claimed = claims.indexOf(key);
        if (claimed === 0) return session.textureImage;
        if (claimed > 0) return this.videoAltSlots.get(src)?.[claimed - 1]?.image ?? null;

        if (claims.length === 0) {
            const image = this.getVideoFrame(src, timestamp);
            // Record what the texture actually holds, not what was asked for: a
            // miss paints the nearest decoded frame, and a later draw wanting
            // *that* frame can then share it rather than taking a slot of its own.
            if (image) claims.push(session.uploadedTs ?? key);
            return image;
        }

        // Beyond the slot cap, reuse the last one. That reintroduces the collision
        // for the overflow draws only, rather than dropping them — a scene with
        // this many simultaneous times of one clip is pathological.
        const slot = Math.min(claims.length - 1, WebStorageAdapter.ALT_SLOT_LIMIT - 1);
        const image = this.uploadAltFrame(src, session, timestamp, slot);
        if (image) claims.push(key);
        return image;
    }

    /** Free every alt-slot texture (surface swap, teardown). */
    private clearVideoAltSlots(): void {
        for (const slots of this.videoAltSlots.values()) {
            for (const slot of slots) slot.image?.delete();
        }
        this.videoAltSlots.clear();
    }

    /** Upload the frame for a non-primary timestamp into its slot — see {@link claimVideoFrame}. */
    private uploadAltFrame(
        src: string,
        session: VideoSession,
        timestamp: number,
        slotIndex: number,
    ): CKImage | null {
        const surface = this.surface;
        if (!surface) return null;
        const frame = this.decodedFrameFor(src, session, timestamp);
        if (!frame) return null;

        let slots = this.videoAltSlots.get(src);
        if (!slots) { slots = []; this.videoAltSlots.set(src, slots); }
        let slot = slots[slotIndex];
        if (!slot) { slot = { image: null, uploadedTs: null }; slots[slotIndex] = slot; }

        const key = this.quantizeTs(frame.timestamp, session.frameStep);
        if (slot.image && slot.uploadedTs === key) return slot.image;
        if (!slot.image) {
            slot.image = surface.makeImageFromTextureSource(frame.bitmap, {
                width: session.width,
                height: session.height,
                alphaType: this.canvasKit.AlphaType.Unpremul,
                colorType: this.canvasKit.ColorType.RGBA_8888,
                colorSpace: this.canvasKit.ColorSpace.SRGB,
            });
        } else {
            surface.updateTextureFromSource(slot.image, frame.bitmap);
        }
        slot.uploadedTs = slot.image ? key : null;
        return slot.image;
    }

    /**
     * The decoded frame to show a non-primary playhead at `timestamp`: the exact
     * one when it's warm, otherwise the nearest decoded (so the picture degrades
     * like the primary path instead of blanking) with the exact one queued for
     * decode. Null only when nothing at all is decoded for the clip yet.
     */
    private decodedFrameFor(
        src: string,
        session: VideoSession,
        timestamp: number,
    ): DecodedVideoFrame | null {
        const step = session.frameStep;
        const clamped = Math.max(0, Math.min(timestamp, session.durationSec));
        // The echo cache first — its entries survive the playhead window's
        // eviction, which is centred on the *primary* head and so routinely
        // excludes wherever this one is looking.
        const echo = this.videoEchoFrames.get(src);
        const window = this.videoFrames.get(src);
        const exact =
            this.nearestWithin(echo, clamped, step) ??
            this.nearestWithin(window, clamped, step);
        if (exact) return exact;

        // Queue it on the echo hatch — a per-src *set*, so several concurrent
        // heads all get warmed, unlike pendingVideoFrames' one-per-src slot.
        let set = this.pendingEchoFrames.get(src);
        if (!set) { set = new Set(); this.pendingEchoFrames.set(src, set); }
        set.add(clamped);
        // While playing there is no blocking caller to drain that hatch, and the
        // sequential prefetch only runs ahead of the primary head — so start this
        // one's decode now or it would never arrive.
        if (this.playing) void this.decodeEchoFrameAt(src, clamped);

        const nearEcho = echo ? this.nearestDecoded(echo, clamped, step) : null;
        const nearWindow = window ? this.nearestDecoded(window, clamped, step) : null;
        if (!nearEcho) return nearWindow;
        if (!nearWindow) return nearEcho;
        return Math.abs(nearEcho.timestamp - clamped) <= Math.abs(nearWindow.timestamp - clamped)
            ? nearEcho
            : nearWindow;
    }

    /**
     * The decoded length of `src` in seconds, or `0` when its session hasn't
     * opened yet (or the src isn't a video). Read as a video fill resolves its
     * own timestamp — the loop cycle and the `trimEnd` default come from it.
     *
     * This is the *container's* duration rather than the build-time manifest's,
     * so looping still works for a source whose manifest probe couldn't read one.
     * Before the session exists there is no frame to paint either, so the
     * unlooped fallback is never actually seen.
     */
    getVideoDuration(src: string): number {
        return this.videoSessions.get(src)?.durationSec ?? 0;
    }

    /**
     * Like {@link getVideoFrame}, but returns an INDEPENDENT, caller-owned image
     * for a past `timestamp` instead of the shared per-session texture. Used by
     * the video Echo filter, which needs several frames resident at once — calling
     * getVideoFrame twice would clobber the single session texture. Returns the
     * nearest already-decoded frame within the warm window, or null if none is
     * decoded (the caller simply skips that echo tap, so a cold seek degrades to
     * the current frame and the trail fills in as playback warms the back window).
     *
     * The caller OWNS the returned image and must push it to `transientImages` so
     * the fill handler deletes it after the draw — that bounds GPU memory to the
     * tap count for the duration of one shape's draw.
     *
     * On a miss (the exact past frame isn't decoded yet) it records the timestamp
     * for {@link warmPendingVideo} and returns null, so the tap is skipped this
     * pass and a blocking caller (seek/screenshot/export) decodes it and re-renders
     * — making the trail frame-accurate. During live playback the back-window
     * fills these in, so misses settle within a frame or two.
     */
    getVideoFrameImage(src: string, timestamp: number): CKImage | null {
        const session = this.videoSessions.get(src);
        if (!session || !this.surface || !Number.isFinite(timestamp)) return null;

        const clamped = Math.max(0, Math.min(timestamp, session.durationSec));
        const step = session.frameStep;
        // The decoded sample for a requested time lands on the source's own frame
        // grid, which may quantize to an adjacent key — so match the NEAREST frame
        // within half a frame step (like the playback path's nearestDecoded) rather
        // than an exact key. Prefer the dedicated echo cache, then a frame already
        // warm in the playback window (lets live playback skip a decode round-trip).
        const frame =
            this.nearestWithin(this.videoEchoFrames.get(src), clamped, step) ??
            this.nearestWithin(this.videoFrames.get(src), clamped, step);
        if (!frame) {
            // Not decoded — register it so warmPendingVideo() decodes it into the
            // echo cache for the next (re-)render. Skip this tap for now.
            let set = this.pendingEchoFrames.get(src);
            if (!set) { set = new Set(); this.pendingEchoFrames.set(src, set); }
            set.add(clamped);
            return null;
        }

        return this.surface.makeImageFromTextureSource(frame.bitmap, {
            width: session.width,
            height: session.height,
            alphaType: this.canvasKit.AlphaType.Unpremul,
            colorType: this.canvasKit.ColorType.RGBA_8888,
            colorSpace: this.canvasKit.ColorSpace.SRGB,
        });
    }

    /**
     * Upload `frame`'s bitmap into the session's persistent texture (creating it on
     * first use) and return the image. No-op upload when the same timestamp is
     * already resident, so a paused/parked playhead costs nothing per render.
     */
    private uploadFrame(src: string, session: VideoSession, frame: DecodedVideoFrame): CKImage | null {
        const surface = this.surface;
        if (!surface) return null;
        const key = this.quantizeTs(frame.timestamp, session.frameStep);
        if (session.textureImage && session.uploadedTs === key) return session.textureImage;

        if (!session.textureImage) {
            session.textureImage = surface.makeImageFromTextureSource(frame.bitmap, {
                width: session.width,
                height: session.height,
                alphaType: this.canvasKit.AlphaType.Unpremul,
                colorType: this.canvasKit.ColorType.RGBA_8888,
                colorSpace: this.canvasKit.ColorSpace.SRGB,
            });
        } else {
            surface.updateTextureFromSource(session.textureImage, frame.bitmap);
        }
        session.uploadedTs = session.textureImage ? key : null;
        return session.textureImage;
    }

    /**
     * Decode every exact frame a prior render asked for but couldn't satisfy, and
     * report whether there were any. A blocking caller (seek / screenshot / export)
     * renders once, awaits this, and re-renders if it returns true — guaranteeing
     * the still is frame-accurate even on a cold jump, without any render site
     * needing to know the per-fill playback math. Returns false once everything the
     * last render asked for is warm, so the re-render loop terminates.
     */
    async warmPendingVideo(): Promise<boolean> {
        const pending = [...this.pendingVideoFrames];
        this.pendingVideoFrames.clear();

        // Echo's past-frame taps: decode each requested past timestamp too, so the
        // trail is frame-accurate on a static seek/export (where the back-window
        // isn't filled by playback).
        const echo = [...this.pendingEchoFrames].flatMap(
            ([src, set]) => [...set].map((ts) => [src, ts] as [string, number]),
        );
        this.pendingEchoFrames.clear();

        // 3D shares this hatch. A `view3D` op that couldn't be drawn
        // synchronously — the three runtime still importing on a cold first frame —
        // registers itself, and every existing caller of this method (export,
        // screenshot, seek) already re-renders while it returns true. So 3D warms
        // up frame-accurately without any of those call sites knowing about it.
        //
        // Drained before the early return below so a 3D-only scene, which queues no
        // video work at all, still gets its runtime loaded.
        const warmed3D = await warmPendingView3D();

        if (pending.length === 0 && echo.length === 0) return warmed3D;
        await Promise.all([
            ...pending.map(([src, ts]) => this.decodeAt(src, ts)),
            ...echo.map(([src, ts]) => this.decodeEchoFrameAt(src, ts)),
        ]);
        return true;
    }

    /**
     * Sequentially decode forward from `timestamp` to fill the window ahead, using
     * mediabunny's monotonic pipeline (each packet decoded at most once) — far
     * cheaper than a random `getCanvas` per frame. At most one pass runs per src at
     * a time; it stops as soon as playback pauses or the playhead jumps away.
     */
    private driveSequentialDecode(src: string, timestamp: number): void {
        const session = this.videoSessions.get(src);
        if (!session || session.decoding) return;
        const frames = this.videoFrames.get(src);
        if (!frames) return;

        const step = session.frameStep;
        const end = Math.min(session.durationSec, timestamp + WebStorageAdapter.FORWARD_WINDOW_FRAMES * step);
        if (timestamp >= end) return;

        session.decoding = true;
        void (async () => {
            try {
                for await (const wrapped of session.sink.canvases(timestamp, end + step)) {
                    if (this.disposed) break;
                    const store = this.videoFrames.get(src);
                    if (!store) break;
                    const key = this.quantizeTs(wrapped.timestamp, step);
                    if (!store.has(key)) {
                        store.set(key, { timestamp: wrapped.timestamp, bitmap: await this.snapshot(wrapped.canvas) });
                    }
                    // Bail if the playhead jumped backward/away or playback paused —
                    // a fresh pass will be started for the new position.
                    const head = this.videoPlayhead.get(src) ?? timestamp;
                    if (!this.playing || head < timestamp - step || head > end) break;
                }
                this.evictVideoWindow(src, this.videoPlayhead.get(src) ?? timestamp, step);
            } catch (err) {
                if (!this.disposed) console.error(`[WebStorageAdapter] sequential decode failed for ${src}:`, err);
            } finally {
                session.decoding = false;
            }
        })();
    }

    /**
     * Decode the single frame containing `timestampSec` (random access) and cache
     * its bitmap. Used for cold warms (entry frame, seek/screenshot/export target)
     * where sequential streaming isn't appropriate. Idempotent per quantized ts.
     */
    private async decodeAt(src: string, timestampSec: number): Promise<void> {
        const session = this.videoSessions.get(src);
        if (!session || !Number.isFinite(timestampSec)) return;
        const clamped = Math.max(0, Math.min(timestampSec, session.durationSec));
        const key = this.quantizeTs(clamped, session.frameStep);
        const store = this.videoFrames.get(src);
        if (!store || store.has(key)) return;

        try {
            const wrapped = await session.sink.getCanvas(clamped);
            if (!wrapped || this.disposed) return;
            const dst = this.videoFrames.get(src);
            if (!dst) return;
            const k = this.quantizeTs(wrapped.timestamp, session.frameStep);
            if (!dst.has(k)) dst.set(k, { timestamp: wrapped.timestamp, bitmap: await this.snapshot(wrapped.canvas) });
            this.evictVideoWindow(src, clamped, session.frameStep);
        } catch (err) {
            if (!this.disposed) console.error(`[WebStorageAdapter] video decode failed for ${src}@${clamped}:`, err);
        }
    }

    /**
     * Decode a single past frame into the dedicated {@link videoEchoFrames} cache
     * for the Echo filter. Like {@link decodeAt} but it does NOT window-evict — echo
     * taps reach intentionally outside the playback window, so they must survive the
     * current playhead's eviction. Bounds the cache to {@link ECHO_CACHE_LIMIT}
     * frames per src (oldest-inserted dropped first). Idempotent per quantized ts.
     *
     * Concurrent calls for the same frame join one decode: a second playhead asks
     * every frame until its frame lands ({@link decodedFrameFor}), and each decode
     * is an async `getCanvas` — without this, one cold scrub would queue the same
     * seek dozens of times.
     */
    private decodeEchoFrameAt(src: string, timestampSec: number): Promise<void> {
        const session = this.videoSessions.get(src);
        if (!session || !Number.isFinite(timestampSec)) return Promise.resolve();
        const clamped = Math.max(0, Math.min(timestampSec, session.durationSec));
        const key = this.quantizeTs(clamped, session.frameStep);
        if (this.videoEchoFrames.get(src)?.has(key)) return Promise.resolve();

        const id = `${src}#${key}`;
        const inFlight = this.echoDecodes.get(id);
        if (inFlight) return inFlight;
        const decode = this.decodeEchoFrameNow(src, session, clamped, key)
            .finally(() => this.echoDecodes.delete(id));
        this.echoDecodes.set(id, decode);
        return decode;
    }

    /** {@link decodeEchoFrameAt}'s body, past the dedup gate. */
    private async decodeEchoFrameNow(
        src: string,
        session: VideoSession,
        clamped: number,
        key: number,
    ): Promise<void> {
        let store = this.videoEchoFrames.get(src);
        // Already warm in the playback window? Copy the reference in rather than re-decode.
        const windowed = this.videoFrames.get(src)?.get(key);

        try {
            if (!store) { store = new Map(); this.videoEchoFrames.set(src, store); }
            if (windowed) {
                store.set(key, windowed);
            } else {
                const wrapped = await session.sink.getCanvas(clamped);
                if (!wrapped || this.disposed) return;
                store = this.videoEchoFrames.get(src);
                if (!store) return;
                const k = this.quantizeTs(wrapped.timestamp, session.frameStep);
                if (!store.has(k)) store.set(k, { timestamp: wrapped.timestamp, bitmap: await this.snapshot(wrapped.canvas) });
            }
            this.trimEchoCache(src);
        } catch (err) {
            if (!this.disposed) console.error(`[WebStorageAdapter] echo decode failed for ${src}@${clamped}:`, err);
        }
    }

    /** Bound the echo cache to ECHO_CACHE_LIMIT frames per src, dropping oldest-inserted first. */
    private trimEchoCache(src: string): void {
        const store = this.videoEchoFrames.get(src);
        if (!store) return;
        while (store.size > WebStorageAdapter.ECHO_CACHE_LIMIT) {
            const oldest = store.keys().next().value as number | undefined;
            if (oldest === undefined) break;
            const frame = store.get(oldest);
            // Only close the bitmap if it isn't shared with the live playback window.
            if (frame && this.videoFrames.get(src)?.get(oldest) !== frame) frame.bitmap.close();
            store.delete(oldest);
        }
    }

    /** Snapshot a decoded (possibly pooled) canvas into an immutable, GPU-friendly ImageBitmap. */
    private snapshot(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<ImageBitmap> {
        return createImageBitmap(canvas);
    }

    /** Drop decoded frames (closing their bitmaps) outside [ts - BACK, ts + FORWARD] (source seconds). */
    private evictVideoWindow(src: string, timestamp: number, step: number): void {
        const frames = this.videoFrames.get(src);
        if (!frames) return;
        const lo = timestamp - WebStorageAdapter.BACK_WINDOW_FRAMES * step;
        const hi = timestamp + WebStorageAdapter.FORWARD_WINDOW_FRAMES * step;
        for (const [key, frame] of frames) {
            if (frame.timestamp < lo || frame.timestamp > hi) {
                frame.bitmap.close();
                frames.delete(key);
            }
        }
    }

    /**
     * Closest decoded frame to `timestamp`, or null if none are decoded yet. We
     * return the nearest available sample rather than requiring an exact hit so a
     * not-yet-warm playhead paints the closest frame (the caller separately decodes
     * the exact timestamp for the next render).
     */
    private nearestDecoded(
        frames: Map<number, DecodedVideoFrame>,
        timestamp: number,
        step: number,
    ): DecodedVideoFrame | null {
        const exact = frames.get(this.quantizeTs(timestamp, step));
        if (exact) return exact;
        let best: DecodedVideoFrame | null = null;
        let bestDist = Infinity;
        for (const frame of frames.values()) {
            const dist = Math.abs(frame.timestamp - timestamp);
            if (dist < bestDist) { bestDist = dist; best = frame; }
        }
        return best;
    }

    /** Quantize a source timestamp to a stable integer ring key. */
    private quantizeTs(timestamp: number, step: number): number {
        return Math.round(timestamp / step);
    }

    /**
     * The frame in `store` closest to `timestamp`, but only if it's within ~one
     * frame step (so a requested time matches the decoded sample whose grid-aligned
     * timestamp quantized to an adjacent key, without ever returning a clearly wrong
     * frame). Used by the Echo lookup, whose taps are sparse exact-ish requests.
     */
    private nearestWithin(
        store: Map<number, DecodedVideoFrame> | undefined,
        timestamp: number,
        step: number,
    ): DecodedVideoFrame | null {
        if (!store || store.size === 0) return null;
        let best: DecodedVideoFrame | null = null;
        let bestDist = Infinity;
        for (const frame of store.values()) {
            const dist = Math.abs(frame.timestamp - timestamp);
            if (dist < bestDist) { bestDist = dist; best = frame; }
        }
        return best && bestDist <= step ? best : null;
    }

    /** Probe the first sample for the frame step (seconds) and decoded size; fall back to ~30fps / target. */
    private async probeFirstFrame(
        track: InputVideoTrack,
        target: { width: number; height: number } | null,
    ): Promise<{ frameStep: number; width: number; height: number }> {
        try {
            const probe = new CanvasSink(track, {
                poolSize: 1,
                ...(target ? { width: target.width, height: target.height, fit: "fill" as const } : {}),
            });
            const first = await probe.getCanvas(0);
            if (first) {
                return {
                    frameStep: first.duration > 0 ? first.duration : 1 / 30,
                    width: first.canvas.width,
                    height: first.canvas.height,
                };
            }
        } catch {
            // ignore — fall through to defaults
        }
        return { frameStep: 1 / 30, width: target?.width ?? 1, height: target?.height ?? 1 };
    }

    /**
     * Pick the decode resolution for a video, preserving aspect ratio, the same
     * way {@link imageTargetPixels} does for images — downscale only when the
     * on-screen target is smaller than the source.
     */
    private videoTargetPixels(src: string, width: number, height: number): { width: number; height: number } | null {
        let meta: { width: number; height: number };
        try { meta = this.catalog.getVideoMeta(src); } catch { return null; }
        if (!meta.width || !meta.height) return null;
        if (width <= 0 && height <= 0) return null;

        const targetW = width > 0 ? Math.min(width, this.viewport.width) : 0;
        const targetH = height > 0 ? Math.min(height, this.viewport.height) : 0;

        const sx = targetW > 0 ? targetW / meta.width : 0;
        const sy = targetH > 0 ? targetH / meta.height : 0;
        const ratio = Math.max(sx, sy);
        if (ratio <= 0 || ratio >= 1) return null;

        return {
            width: Math.max(1, Math.round(meta.width * ratio)),
            height: Math.max(1, Math.round(meta.height * ratio)),
        };
    }


    private makeCKImageFromPixels(pixels: Uint8Array, width: number, height: number): CKImage | null {
        return this.canvasKit.MakeImage(
            {
                width,
                height,
                alphaType: this.canvasKit.AlphaType.Unpremul,
                colorType: this.canvasKit.ColorType.RGBA_8888,
                colorSpace: this.canvasKit.ColorSpace.SRGB,
            },
            pixels,
            4 * width,
        );
    }

    // ─── Audio ───────────────────────────────────────────────────────────────

    /** Fetches and decodes `src` into a Web Audio `AudioBuffer`, cached for {@link getAudioBuffer}. No-op if already cached. */
    async loadAudio(
        src: string,
        _startFrame: number,
        _endFrame: number,
        _trimStart: number = 0,
        _trimEnd?: number,
    ): Promise<void> {
        if (this.audioBuffers.has(src)) return;
        if (!this.audioCtx) this.audioCtx = new AudioContext();

        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(src, audioBuffer);
    }

    async fetchAudioData(src: string): Promise<ArrayBuffer> {
        const response = await fetch(src);
        return response.arrayBuffer();
    }

    getAudioBuffer(src: string): AudioBuffer | null {
        return this.audioBuffers.get(src) ?? null;
    }

    // ─── Font ────────────────────────────────────────────────────────────────

    /** Registers every weight/slant file for `fontFamily` with the shared {@link TypefaceFontProvider} under the bare family name (once per family — see {@link registeredFontFamilies}); enables dynamic/tweenable weight matching at draw time. */
    async loadFont(key: string, fontFamily: string, _fontWeight: number): Promise<void> {
        // Register every weight/slant of the family under its bare family name so
        // CanvasKit's matcher (see resolveTypeface) can pick the closest file for
        // any requested weight — that's what gives us dynamic, tween-able weights
        // instead of needing an exact `family@weight` file. Done once per family.
        if (this.registeredFontFamilies.has(fontFamily)) return;

        const metas = this.catalog.getFontFamilyMetas(fontFamily);
        if (metas.length === 0) {
            console.warn(`[WebStorageAdapter] No font manifest entry for "${key}". Add it to the manifest font record.`);
            return;
        }

        // Dedupe by src in case the same file is registered under multiple keys.
        const sources = [...new Set(metas.map(m => m.src))];
        await Promise.all(sources.map(async src => {
            const response = await fetch(src);
            const bytes = await response.arrayBuffer();
            this.fontMgr.registerFont(new Uint8Array(bytes), fontFamily);
        }));

        this.registeredFontFamilies.add(fontFamily);
        // A new face just became available: invalidate any paragraph shaped
        // against the old (fallback) face for this or any family.
        this.fontEpoch++;
    }

    getFontMgr(): TypefaceFontProvider {
        return this.fontMgr;
    }

    /** The shared shaped-text cache (see {@link paragraphCache}). */
    getParagraphCache(): ParagraphShapeCache {
        return this.paragraphCache;
    }

    /** Current font-registration epoch, folded into paragraph cache keys. */
    getFontEpoch(): number {
        return this.fontEpoch;
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;

        this.paragraphCache.dispose();

        for (const img of this.imageCKCache.values()) img.delete();
        this.imageCKCache.clear();
        this.imagePixels.clear();

        for (const image of this.view3DTextures.values()) image.delete();
        this.view3DTextures.clear();

        // Close window bitmaps, tracking them so shared echo entries aren't
        // double-closed below.
        const closed = new Set<ImageBitmap>();
        for (const frames of this.videoFrames.values()) {
            for (const { bitmap } of frames.values()) { bitmap.close(); closed.add(bitmap); }
        }
        this.videoFrames.clear();
        for (const frames of this.videoEchoFrames.values()) {
            for (const { bitmap } of frames.values()) if (!closed.has(bitmap)) bitmap.close();
        }
        this.videoEchoFrames.clear();
        for (const session of this.videoSessions.values()) {
            session.textureImage?.delete();
            session.input.dispose();
        }
        this.videoSessions.clear();
        this.clearVideoAltSlots();
        this.videoPlayhead.clear();
        this.videoFrameClaims.clear();
        this.pendingVideoFrames.clear();
        this.pendingEchoFrames.clear();
        this.echoDecodes.clear();
        this.surface = null;



        this.audioBuffers.clear();
        if (this.audioCtx && this.audioCtx.state !== "closed") {
            this.audioCtx.close();
        }
        this.audioCtx = null;

        super.dispose();
    }
}

