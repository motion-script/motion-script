import type { CanvasKit, Image as CKImage, Surface, TypefaceFontProvider } from "@motion-script/canvaskit";
import type { ParagraphShapeCache } from "./shapes/paragraph-cache";

/**
 * The slice of the platform's storage adapter this renderer reads.
 *
 * Split into narrow sub-interfaces rather than one wide type, following the
 * precedent {@link Skia3DAssets} was extracted from (it was `View3DAssets`, whose
 * docstring already made the argument: narrowed "so the reconciler and texture
 * cache stay testable without a real CanvasKit surface"). Each consumer asks for
 * the smallest slice it uses, which is also what keeps them unit-testable with a
 * literal object instead of a whole adapter.
 *
 * Everything here is *synchronous*. All decoding happens up front — the adapter
 * has already resolved this frame's assets by the time a render pass starts — so
 * a fill that misses degrades (paints the nearest decoded frame, declines to
 * paint) rather than awaiting. That contract is what lets `render()` stay
 * synchronous per frame.
 */

/**
 * An opaque platform handle Skia can upload as a texture: a DOM canvas, an
 * `ImageBitmap`, a `VideoFrame`, a native pixel buffer.
 *
 * Deliberately `unknown`. This renderer never dereferences one — it only carries
 * a handle from whatever produced it (the 3D renderer's output buffer) to
 * whatever consumes it ({@link Skia3DAssets.upload3DFrame}), both of which are
 * platform code. Naming a DOM type here instead would be the one place the
 * browser leaks into an otherwise backend-agnostic package.
 */
export type SkiaTextureSource = unknown;

/** Decoded RGBA pixels for an asset, in the layout `CanvasKit.MakeImage` expects. */
export interface DecodedPixels {
    pixels: Uint8Array;
    width: number;
    height: number;
}

/** Fonts and shaped-text caches every text path reads. */
export interface SkiaTextAssets {
    getFontMgr(): TypefaceFontProvider;
    getParagraphCache(): ParagraphShapeCache;
    /**
     * Bumped whenever a family registers. Fold it into any cache key derived from
     * the font manager, so a run shaped before its webfont arrived (and therefore
     * shaped against a fallback face) is invalidated the moment the real one lands.
     */
    getFontEpoch(): number;
}

/** Decoded raster images. */
export interface SkiaImageAssets {
    /** GPU-uploaded image for an asset path, or null until it has decoded. */
    getCKImage(src: string): CKImage | null;
    /** Raw decoded RGBA pixels for an asset path, or null until loaded. */
    getImagePixels(src: string): DecodedPixels | null;
}

/**
 * Time-varying media.
 *
 * Note {@link claimVideoFrame} — not a bare `getVideoFrame` — is what a fill
 * calls. A session's texture is updated in place and Skia doesn't resolve a draw
 * until the surface flushes, so two draws of the same clip at different times
 * must be handed *different* textures or both would sample whichever was
 * uploaded last. Claiming is what allocates them.
 */
export interface SkiaVideoAssets {
    /** Decoded length in seconds, or 0 before the clip's session has opened. */
    getVideoDuration(src: string): number;
    /** The image to paint `src` at `timestamp` for one draw in the current pass. Adapter-owned. */
    claimVideoFrame(src: string, timestamp: number): CKImage | null;
    /** A past frame for an echo tap. **Caller-owned** — push it to `transientImages`. */
    getVideoFrameImage(src: string, timestamp: number): CKImage | null;
}

/**
 * Composite textures for 3D fills.
 *
 * Keyed by `${nodeId}#${paintSlot}` rather than by node: a node can carry two 3D
 * fills, and a fill cross-fade transiently produces exactly that.
 */
export interface Skia3DAssets {
    /**
     * Upload a rendered 3D frame into the texture held for `key`, creating it on
     * first use and updating it in place afterwards. The returned image is
     * adapter-owned and reused across frames, so it must **not** be deleted after
     * the draw.
     *
     * Implementations must treat `source` as **premultiplied** — the 3D renderer
     * produces premultiplied output, and telling Skia otherwise double-premultiplies
     * and dark-fringes every antialiased 3D edge. This is the opposite of the video
     * path, which uploads unpremultiplied; the two conventions are adjacent in the
     * adapter and must not be unified.
     */
    upload3DFrame(key: string, source: SkiaTextureSource, width: number, height: number): CKImage | null;
    /** Free the texture held for a slot whose node has gone away. */
    release3DTexture(key: string): void;
}

/**
 * Everything the renderer reads off the platform's storage adapter.
 *
 * `@motion-script/web`'s `WebStorageAdapter` satisfies this structurally; a native
 * backend supplies its own. Note what is deliberately *absent*: nothing here
 * loads, fetches or decodes. Those are the platform's own API, invoked before the
 * frame, and this renderer never calls them.
 */
export interface SkiaAssets
    extends SkiaTextAssets, SkiaImageAssets, SkiaVideoAssets, Skia3DAssets {
    getCanvasKit(): CanvasKit;
    /**
     * Start a render pass: forget which timestamp each clip's shared texture was
     * claimed for. Paired with the render context's other per-pass brackets.
     */
    beginRenderPass(): void;
    /**
     * Hand over the live draw surface, so frames upload straight to a GPU texture
     * with no CPU readback. `null` on teardown, which must also drop any images
     * tied to the outgoing surface — they become dangling texture handles otherwise.
     */
    setSurface(surface: Surface | null): void;
    dispose(): void;
}
