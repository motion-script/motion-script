import { AssetRecord, LoaderFn } from "@/assets/record";
import { AssetCatalog } from "./catalog";
import type { AudioRequest } from "@/attributes/audio/request";

/**
 * Collects asset requests emitted during a frame render pass and maintains their
 * frame-range entries. Call {@link start} before rendering a frame and {@link end}
 * after; use the request methods inside the render to register each asset needed.
 */
export class AssetTracker {
    private readonly _catalog: AssetCatalog;
    constructor(assetCatalog: AssetCatalog) {
        this._catalog = assetCatalog;
    }

    get catalog(): AssetCatalog { return this._catalog; }

    /**
     * Register an opaque async loader needed at the current frame, tracked on the
     * timeline by `key` so the {@link AssetManager} runs it once its cache window
     * opens and disposes it when the window closes. Deduped by `key` (like
     * {@link requestFont} by family): the first registration's `load` callback is
     * kept and its frame range extends as later frames re-request the same key.
     */
    requestLoader(key: string, load: LoaderFn): void {
        this.upsertAsset(key, (frame) => ({
            type: 'loader',
            src: key,
            startFrame: frame,
            endFrame: frame,
            load,
        }));
    }

    /** Pending requests collected during the current frame's load pass. */
    private requestedAssets: Map<string, AssetRecord> = new Map();
    private _audioRequests: AudioRequest[] = [];
    private _audioIds = new Set<string>();

    get assets(): ReadonlyMap<string, AssetRecord> { return this.requestedAssets; }
    get audioRequests(): readonly AudioRequest[] { return this._audioRequests; }

    /**
     * Add an audio playback request. Stored by reference so mutations from stop()
     * are reflected when audioRequests is read after the build. Deduplicated by id.
     * Called from {@link Sound.prepare}.
     */
    addAudioRequest(req: AudioRequest): void {
        if (this._audioIds.has(req.id)) return;
        this._audioIds.add(req.id);
        this._audioRequests.push(req);
    }

    /** Register an audio file for loading at the current frame (frame-range caching, like requestImage). */
    requestAudio(src: string): void {
        this.upsertAsset(src, (frame) => ({
            type: 'audio',
            src,
            startFrame: frame,
            endFrame: frame,
            trimStart: 0,
            trimEnd: Infinity,
        }));
    }

    /** Clear audio requests accumulated for the current scene. Call after reading audioRequests for each scene. */
    clearAudio(): void {
        this._audioRequests.length = 0;
        this._audioIds.clear();
    }

    private currentFrame?: number;

    /** Mark the beginning of a frame render pass so request methods know the current frame. */
    start(frame: number): void {
        this.currentFrame = frame;
    }

    /** Mark the end of a frame render pass. */
    end(): void {
        this.currentFrame = undefined;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    private ensureFrame(): number {
        if (this.currentFrame === undefined) {
            throw new Error("Must run start() before requesting assets");
        }
        return this.currentFrame;
    }

    /**
     * Update the frame range for an existing entry or create a new one.
     * `makeEntry` is called only when no entry exists yet for `key`.
     */
    private upsertAsset(key: string, makeEntry: (frame: number) => AssetRecord): void {
        const frame = this.ensureFrame();
        const entry = this.requestedAssets.get(key);
        if (entry) {
            if (entry.startFrame === frame) return;
            this.requestedAssets.set(key, { ...entry, endFrame: frame });
            return;
        }
        this.requestedAssets.set(key, makeEntry(frame));
    }

    // ─── Public request API ───────────────────────────────────────────────────

    /** Register an image asset needed at the current frame, tracking the maximum rendered size. */
    requestImage(src: string, width: number = 0, height: number = 0): void {
        const frame = this.ensureFrame();
        const entry = this.requestedAssets.get(src);
        if (entry && entry.type === 'image') {
            if (entry.startFrame === frame) return;
            this.requestedAssets.set(src, {
                ...entry,
                endFrame: frame,
                width: Math.max(entry.width, width),
                height: Math.max(entry.height, height),
            });
            return;
        }
        this.requestedAssets.set(src, {
            type: 'image',
            startFrame: frame,
            endFrame: frame,
            width,
            height,
            src,
        });
    }

    /** Register a video asset needed at the current frame, tracking the maximum rendered size. */
    requestVideo(
        src: string,
        width: number = 0,
        height: number = 0,
        trimStart: number = 0,
        trimEnd?: number,
    ): void {
        const frame = this.ensureFrame();
        const entry = this.requestedAssets.get(src);
        if (entry && entry.type === 'video') {
            if (entry.startFrame === frame) return;
            this.requestedAssets.set(src, {
                ...entry,
                endFrame: frame,
                width: Math.max(entry.width, width),
                height: Math.max(entry.height, height),
            });
            return;
        }
        this.requestedAssets.set(src, {
            type: 'video',
            startFrame: frame,
            endFrame: frame,
            width,
            height,
            src,
            trimStart,
            trimEnd: trimEnd ?? this._catalog.getVideoDuration(src),
        });
    }

    /**
     * Register a font face needed at the current frame, keyed by family only.
     *
     * The key is deliberately *not* `family@weight`: loadFont registers the
     * whole family at once (every weight file), and continuous/variable weight
     * is rendered via the layout's `fontVariations` axis — never via a
     * per-weight file. Including the weight in the key would mint a distinct
     * asset entry for every frame of a weight tween (`Inter@437.2`, `Inter@482.9`,
     * …), exploding the asset map and re-dispatching a load per weight on every
     * prefetch tick. Keying by family collapses all of those to one stable entry.
     */
    requestFont(fontFamily: string, fontWeight: string): void {
        this.upsertAsset(fontFamily, (frame) => ({
            type: 'font',
            startFrame: frame,
            endFrame: frame,
            fontWeight: parseInt(fontWeight, 10) || 400,
            fontFamily,
            src: fontFamily,
        }));
    }


    /** Remove all tracked entries whose frame ranges fall entirely outside [startFrame, endFrame]. */
    discardOutside(startFrame: number, endFrame: number): void {
        for (const [key, entry] of this.requestedAssets) {
            if (entry.endFrame < startFrame || entry.startFrame > endFrame) {
                this.requestedAssets.delete(key);
            }
        }
    }

    /** Clear all tracked entries (including loaders) without releasing the instance. */
    clear() {
        this.requestedAssets.clear();
        this._audioRequests.length = 0;
        this._audioIds.clear();
    }



    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /** Release all state; the instance should not be used after this call. */
    dispose(): void {
        this.requestedAssets.clear();
        this._audioRequests.length = 0;
        this._audioIds.clear();
    }
}
