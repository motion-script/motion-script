import type {
    CanvasKit,
    Image as CKImage,
    Surface,
    TypefaceFontProvider,
} from '@motion-script/canvaskit';
import { AssetCatalog, StorageAdapter, type Size2D } from '@motion-script/core';
import { ParagraphShapeCache } from '@motion-script/skia-render/shapes/paragraph-cache';
import type { DecodedPixels, SkiaAssets, SkiaTextureSource } from '@motion-script/skia-render/assets';
import { EngineError } from './errors.js';
import type { EngineLogger } from './types.js';

/** Reads an asset's bytes. How a `src` maps to bytes is the host's business, not the renderer's. */
export type AssetLoader = (src: string) => Promise<Uint8Array>;

/** Turns encoded image bytes into raw RGBA. Injected because it needs a decoder Node does not ship. */
export type ImageDecoder = (bytes: Uint8Array, src: string) => Promise<DecodedPixels>;

export interface NodeStorageAdapterOptions {
    canvasKit: CanvasKit;
    catalog: AssetCatalog;
    viewport: Size2D;
    loadAsset: AssetLoader;
    decodeImage?: ImageDecoder;
    logger?: EngineLogger;
}

/**
 * The Node half of the renderer: everything about *getting bytes* that
 * `@motion-script/web` does with `fetch`, `ImageDecoder` and Web Audio.
 *
 * The split is the one `SkiaAssets` documents — loading is asynchronous and
 * happens before a frame, while every read the render pass makes is
 * synchronous. So this class is really two halves: `loadXxx` fills the caches,
 * and the `getXxx` accessors hand out what is already there.
 *
 * What Node genuinely lacks, and this therefore has to be given, is a decoder.
 * The CanvasKit build decodes images through WebCodecs (`MakeImageFromEncoded`
 * returns null here), so `decodeImage` is injected rather than assumed — which
 * also keeps this file free of any dependency on a media binary.
 */
export class NodeStorageAdapter extends StorageAdapter implements SkiaAssets {
    private readonly canvasKit: CanvasKit;
    /** Named `fetchBytes`, not `loadAsset`: the base class already has a `loadAsset(key, value)` dispatcher. */
    private readonly fetchBytes: AssetLoader;
    private readonly decodeImage?: ImageDecoder;
    private readonly logger?: EngineLogger;

    private fontMgr: TypefaceFontProvider;
    private readonly paragraphCache = new ParagraphShapeCache();
    /**
     * Bumped whenever a family registers, so a run shaped before its font
     * arrived — and therefore shaped against nothing — is re-shaped once the
     * real face lands.
     */
    private fontEpoch = 0;
    private readonly registeredFamilies = new Set<string>();
    private readonly unknownFamilies = new Set<string>();

    private surface: Surface | null = null;
    private readonly images = new Map<string, { image: CKImage; decoded: DecodedPixels }>();
    /** Pixels each image was decoded for, so a later, larger draw can re-decode. */
    private readonly imageTargetPixels = new Map<string, number>();

    constructor(options: NodeStorageAdapterOptions) {
        super(options.catalog, options.viewport);
        this.canvasKit = options.canvasKit;
        this.fetchBytes = options.loadAsset;
        this.decodeImage = options.decodeImage;
        this.logger = options.logger;
        this.fontMgr = options.canvasKit.TypefaceFontProvider.Make();
    }

    getCanvasKit(): CanvasKit {
        return this.canvasKit;
    }

    // ─── Fonts ────────────────────────────────────────────────────────────────

    /**
     * Register every face the catalog lists for `fontFamily`, under the bare
     * family name so CanvasKit's matcher can pick the closest file for any
     * requested weight — which is what makes weight tween-able rather than
     * needing an exact `family@weight` file.
     */
    async loadFont(key: string, fontFamily: string, _fontWeight: number): Promise<boolean> {
        if (this.registeredFamilies.has(fontFamily)) return true;

        const metas = this.catalog.getFontFamilyMetas(fontFamily);
        if (metas.length === 0) {
            // Returning false keeps the key out of `cachedAssets`, so a catalog
            // that later describes this family can still load it. Warned once,
            // because the render path retries every pass.
            if (!this.unknownFamilies.has(fontFamily)) {
                this.unknownFamilies.add(fontFamily);
                this.logger?.warn?.(
                    `[motion-script] no font registered for "${key}". Unlike a browser, Node has no ` +
                    `system font fallback — text in this family will not render. Pass it in \`fonts\`.`,
                );
            }
            return false;
        }

        // Dedupe by src: the same file is often listed under several keys.
        const sources = [...new Set(metas.map(meta => meta.src))];
        await Promise.all(sources.map(async src => {
            const bytes = await this.fetchBytes(src);
            this.fontMgr.registerFont(bytes, fontFamily);
        }));

        this.registeredFamilies.add(fontFamily);
        this.unknownFamilies.delete(fontFamily);
        this.fontEpoch++;
        return true;
    }

    getFontMgr(): TypefaceFontProvider { return this.fontMgr; }
    getParagraphCache(): ParagraphShapeCache { return this.paragraphCache; }
    getFontEpoch(): number { return this.fontEpoch; }

    // ─── Images ───────────────────────────────────────────────────────────────

    /**
     * An image is decoded at the size it was first asked to draw at, so a later
     * request for a bigger draw is a genuinely different request. Without this
     * the cache short-circuits it and a node scaled up keeps painting the pixels
     * it was decoded at when it was small.
     */
    protected override cacheSatisfies(key: string, _value: unknown): boolean {
        const cached = this.imageTargetPixels.get(key);
        return cached === undefined || cached >= (this.pendingTargetPixels ?? 0);
    }

    /** Target pixel count of the request being dispatched, read by {@link cacheSatisfies}. */
    private pendingTargetPixels: number | undefined;

    async loadImage(src: string, width: number, height: number): Promise<void> {
        // Clamp the decode to the viewport: an 8000px source drawn into a 1920px
        // frame only ever needs 1920px of detail, and decoding the rest costs
        // memory the render never reads.
        const target = Math.ceil(
            Math.min(width, this.viewport.width) * Math.min(height, this.viewport.height),
        );
        this.pendingTargetPixels = target;

        const existing = this.imageTargetPixels.get(src);
        if (existing !== undefined && existing >= target) return;

        if (!this.decodeImage) {
            throw new EngineError(
                'RENDER_FAILED',
                `Cannot decode image "${src}": this engine has no image decoder. ` +
                `Images, video and audio need ffmpeg — install it, or set \`ffmpegPath\`.`,
            );
        }

        const bytes = await this.fetchBytes(src);
        const decoded = await this.decodeImage(bytes, src);
        const image = this.canvasKit.MakeImage(
            {
                width: decoded.width,
                height: decoded.height,
                colorType: this.canvasKit.ColorType.RGBA_8888,
                alphaType: this.canvasKit.AlphaType.Unpremul,
                colorSpace: this.canvasKit.ColorSpace.SRGB,
            },
            decoded.pixels,
            decoded.width * 4,
        );
        if (!image) {
            throw new EngineError('RENDER_FAILED', `Could not upload decoded image "${src}".`);
        }

        this.images.get(src)?.image.delete();
        this.images.set(src, { image, decoded });
        this.imageTargetPixels.set(src, target);
    }

    getCKImage(src: string): CKImage | null {
        return this.images.get(src)?.image ?? null;
    }

    getImagePixels(src: string): DecodedPixels | null {
        return this.images.get(src)?.decoded ?? null;
    }

    // ─── Time-varying media ───────────────────────────────────────────────────

    async loadVideo(
        src: string, _startFrame: number, _endFrame: number,
        _width: number, _height: number, _trimStart: number, _trimEnd?: number,
    ): Promise<void> {
        throw new EngineError(
            'RENDER_FAILED',
            `Cannot load video "${src}": video assets are not supported by this engine yet.`,
        );
    }

    async loadAudio(
        src: string, _startFrame: number, _endFrame: number,
        _trimStart: number, _trimEnd?: number,
    ): Promise<void> {
        throw new EngineError(
            'RENDER_FAILED',
            `Cannot load audio "${src}": audio is not supported by this engine yet.`,
        );
    }

    async fetchAudioData(src: string): Promise<ArrayBuffer> {
        throw new EngineError(
            'RENDER_FAILED',
            `Cannot read audio "${src}": audio is not supported by this engine yet.`,
        );
    }

    // Reads, not loads — these are called during a pass and must never throw.
    // Nothing can have been loaded above, so there is nothing to hand back.
    getVideoDuration(_src: string): number { return 0; }
    claimVideoFrame(_src: string, _timestamp: number): CKImage | null { return null; }
    getVideoFrameImage(_src: string, _timestamp: number): CKImage | null { return null; }

    // ─── 3D ───────────────────────────────────────────────────────────────────

    /**
     * 3D needs a WebGL context to render into, and Node has none — so a
     * `Canvas3D` draws nothing here rather than drawing wrongly. Warned once so
     * a silently empty region has an explanation.
     */
    private warnedAbout3D = false;
    upload3DFrame(_key: string, _source: SkiaTextureSource, _w: number, _h: number): CKImage | null {
        if (!this.warnedAbout3D) {
            this.warnedAbout3D = true;
            this.logger?.warn?.(
                '[motion-script] 3D content cannot be rendered in Node: it needs a WebGL context. ' +
                'Those regions will be empty.',
            );
        }
        return null;
    }
    release3DTexture(_key: string): void { }

    // ─── Pass brackets and lifecycle ──────────────────────────────────────────

    beginRenderPass(): void {
        // Nothing to reset: video is the only per-pass claim, and there is none.
    }

    setSurface(surface: Surface | null): void {
        this.surface = surface;
    }

    override dispose(): void {
        super.dispose();
        for (const { image } of this.images.values()) image.delete();
        this.images.clear();
        this.imageTargetPixels.clear();
        this.registeredFamilies.clear();
        this.paragraphCache.dispose?.();
        this.surface = null;
    }
}
