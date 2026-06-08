import type { CanvasKit, Image as CKImage, TypefaceFontProvider } from "@motion-script/canvaskit";
import { AssetCatalog, StorageAdapter, type Size2D } from "@motion-script/core";

interface CachedPixels {
    width: number;
    height: number;
    pixels: Uint8Array; // RGBA8888
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


    private audioBuffers = new Map<string, AudioBuffer>();
    private audioCtx: AudioContext | null = null;
    private fps: number;

    /** Families already registered with the font provider (registered once, all weights at once). */
    private registeredFontFamilies = new Set<string>();

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

    // ─── Video ───────────────────────────────────────────────────────────────

    /**
     * Open a streaming decode session for `src` and wait for the first frame
     * around `trimStart` to land. The rest of the clip is *not* decoded —
     * frames stream in on-demand as `getVideoFrame` advances the playhead.
     */
    async loadVideo(

    ): Promise<void> {
        throw new Error("Video support is not yet implemented in WebStorageAdapter.");
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
    }

    getFontMgr(): TypefaceFontProvider {
        return this.fontMgr;
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;

        for (const img of this.imageCKCache.values()) img.delete();
        this.imageCKCache.clear();
        this.imagePixels.clear();



        this.audioBuffers.clear();
        if (this.audioCtx && this.audioCtx.state !== "closed") {
            this.audioCtx.close();
        }
        this.audioCtx = null;

        super.dispose();
    }
}

