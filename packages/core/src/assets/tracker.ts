import { AssetRecord, LoaderFn } from "@/assets/record";
import { AssetCatalog } from "./catalog";
import type { AudioRequest } from "@/attributes/audio/request";

/** Rendered size an image/video is wanted at, used to pick a decode resolution. */
export interface AssetSize {
    width?: number;
    height?: number;
}

/** {@link AssetSize} plus the playback window a video clip is trimmed to. */
export interface VideoAssetOptions extends AssetSize {
    /** Seconds into the source the clip starts. Defaults to 0. */
    trimStart?: number;
    /** Seconds into the source the clip ends. Defaults to the source's full duration. */
    trimEnd?: number;
}

/**
 * Collects the assets a node declares and maintains their frame-range entries.
 *
 * A node states what it needs synchronously, from `prepareLayout`/`prepareRender`,
 * against its current prop state — it is never inferred from a render pass. Call
 * {@link start} before walking a frame and {@link end} after; the `add*` methods
 * record into the frame that is open.
 *
 * Declaring rather than inferring is what makes a whole scene's asset set knowable
 * without drawing it: a host that can put the tree into its state at each command
 * boundary can union the declarations and be done, instead of rendering every frame.
 * It is also what lets fonts be loaded *before* layout, since a family no longer has
 * to be discovered by measuring text against it.
 *
 * The cost is that a node which forgets to declare something would paint nothing.
 * That is caught rather than tolerated — see the load-or-throw rule in the fill
 * renderers: an asset the tracker never saw throws when it is reached, during
 * precomp as a `BuildError` and at playback as an exception.
 */
export class AssetTracker {
    private readonly _catalog: AssetCatalog;
    constructor(assetCatalog: AssetCatalog) {
        this._catalog = assetCatalog;
    }

    get catalog(): AssetCatalog { return this._catalog; }

    /**
     * Declare an opaque async load needed at the current frame, tracked on the
     * timeline by `key` so the {@link AssetManager} runs it once its cache window
     * opens and disposes it when the window closes. Deduped by `key` (like
     * {@link addFont} by family): the first registration's `load` callback is
     * kept and its frame range extends as later frames re-declare the same key.
     *
     * This is where a node's *async* setup goes — a syntax grammar, a 3D runtime.
     * The hook that declares it stays synchronous; only the work is deferred, and
     * the timeline decides when to run it. Resolve a {@link Disposer} to free what
     * was loaded when the window closes, or resolve nothing to keep it resident.
     */
    addAsync(key: string, load: LoaderFn): void {
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

    /** Structural path of the node currently being prepared (see withOwnerPath). */
    private _ownerPath: string | undefined;

    /**
     * Run `fn` with `path` recorded as the owner of any audio requests added
     * during it, so the timeline can attribute each clip to its node. Restores
     * the previous owner afterward (prepare walks are not nested today, but this
     * keeps it correct if they ever are).
     */
    withOwnerPath(path: string, fn: () => void): void {
        const prev = this._ownerPath;
        this._ownerPath = path;
        try {
            fn();
        } finally {
            this._ownerPath = prev;
        }
    }

    /**
     * Add an audio playback request. Stored by reference so mutations from stop()
     * are reflected when audioRequests is read after the build. Deduplicated by id.
     * Called from {@link Sound.prepare}. The owning node's path (from the active
     * {@link withOwnerPath} scope) is stamped on first add for timeline display.
     */
    addAudioRequest(req: AudioRequest): void {
        if (this._audioIds.has(req.id)) return;
        this._audioIds.add(req.id);
        if (req.ownerPath === undefined) req.ownerPath = this._ownerPath;
        this._audioRequests.push(req);
    }

    /**
     * Declare an audio file needed at the current frame (frame-range caching,
     * like {@link addImage}).
     *
     * When `src` is already tracked as a *video* (the audio is the video's own
     * track — a {@link Video} node playing its clip's sound), leave that record
     * in place rather than clobbering it with an `audio` entry under the same
     * key. Audio data is fetched on demand via `fetchAudioData`/`syncAudio`, so
     * the record type is irrelevant for audio playback, and the video fill needs
     * its `video` record to decode frames.
     */
    addAudio(src: string): void {
        const existing = this.requestedAssets.get(src);
        if (existing && existing.type === 'video') {
            this.addVideo(src, {
                width: existing.width,
                height: existing.height,
                trimStart: existing.trimStart,
                trimEnd: existing.trimEnd,
            });
            return;
        }
        // Validate the src exists in the manifest (audio file, or a video clip
        // whose audio track is being played). Throws here during precomp — caught
        // and surfaced as a BuildError — instead of silently no-op'ing at playback.
        this._catalog.getMediaDuration(src);
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

    /**
     * Whether a frame is currently open (between {@link start} and {@link end}).
     * Lets a caller that isn't sure whether it's running inside precomp's
     * per-frame pass — e.g. `TrackMeasureScope`/`TrackRenderContext`, which can
     * be invoked from a detached "hug" measurement outside that bracket (see
     * `measureDetached` in `node-lifecycle.ts`) — self-bracket instead of
     * throwing.
     */
    get isActive(): boolean {
        return this.currentFrame !== undefined;
    }

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
            // Extended in place rather than replaced. These records are private to
            // the tracker until `Precomp` snapshots them at the end of the pass, so
            // nothing can observe the mutation — and copying instead meant one
            // throwaway object per asset per frame, which for a video on screen for
            // a whole scene is one allocation for every frame of it.
            entry.endFrame = frame;
            return;
        }
        this.requestedAssets.set(key, makeEntry(frame));
    }

    // ─── Public declaration API ───────────────────────────────────────────────

    /**
     * Declare an image needed at the current frame, tracking the maximum size it
     * is drawn at so the decode can be sized to it.
     *
     * Validates that `src` exists in the manifest. A missing asset (e.g. a
     * deleted/renamed file, or a typo in `src`) throws here during the precomp
     * build pass, where {@link precompScene} records it as a `BuildError` that
     * surfaces in the player's errors panel — rather than silently failing to
     * paint at playback time. This mirrors {@link addVideo}, which already
     * throws via `getVideoDuration` on an unknown src.
     *
     * `size` is optional because a node that has not been laid out yet has no
     * honest answer; omitting it declares the asset at its intrinsic size.
     */
    addImage(src: string, size?: AssetSize): void {
        // Throws "No image metadata for src: <src>" if the asset is unknown.
        this._catalog.getImageMeta(src);
        const width = size?.width ?? 0;
        const height = size?.height ?? 0;
        const frame = this.ensureFrame();
        const entry = this.requestedAssets.get(src);
        if (entry && entry.type === 'image') {
            if (entry.startFrame === frame) return;
            // In place — see the note in `upsertAsset`.
            entry.endFrame = frame;
            entry.width = Math.max(entry.width, width);
            entry.height = Math.max(entry.height, height);
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

    /** Declare a video needed at the current frame, tracking the maximum size it is drawn at. */
    addVideo(src: string, options?: VideoAssetOptions): void {
        const width = options?.width ?? 0;
        const height = options?.height ?? 0;
        const frame = this.ensureFrame();
        const entry = this.requestedAssets.get(src);
        if (entry && entry.type === 'video') {
            if (entry.startFrame === frame) return;
            // In place — see the note in `upsertAsset`.
            entry.endFrame = frame;
            entry.width = Math.max(entry.width, width);
            entry.height = Math.max(entry.height, height);
            return;
        }
        this.requestedAssets.set(src, {
            type: 'video',
            startFrame: frame,
            endFrame: frame,
            width,
            height,
            src,
            trimStart: options?.trimStart ?? 0,
            trimEnd: options?.trimEnd ?? this._catalog.getVideoDuration(src),
        });
    }

    /**
     * Declare a font family needed at the current frame, keyed by family only.
     *
     * The key is deliberately *not* `family@weight`: loadFont registers the
     * whole family at once (every weight file), and continuous/variable weight
     * is rendered via the layout's `fontVariations` axis — never via a
     * per-weight file. Including the weight in the key would mint a distinct
     * asset entry for every frame of a weight tween (`Inter@437.2`, `Inter@482.9`,
     * …), exploding the asset map and re-dispatching a load per weight on every
     * prefetch tick. Keying by family collapses all of those to one stable entry.
     *
     * `fontWeight` is therefore optional and only seeds the record's nominal
     * weight — it never affects which files load, so a caller that does not know
     * the weight yet can leave it out.
     */
    addFont(fontFamily: string, fontWeight?: number | string): void {
        this.upsertAsset(fontFamily, (frame) => ({
            type: 'font',
            startFrame: frame,
            endFrame: frame,
            fontWeight: normalizeWeight(fontWeight),
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

/**
 * Coerce a declared weight to the number a {@link FontRecord} stores.
 *
 * Accepts a number or a string because a node may hold either — `Text.fontWeight`
 * is a number, a `Graphics` text op's is whatever the author wrote. Anything
 * unparseable lands on 400, which is what an unspecified weight means anyway.
 */
function normalizeWeight(weight: number | string | undefined): number {
    if (typeof weight === "number") return Number.isFinite(weight) ? weight : 400;
    if (typeof weight === "string") return parseInt(weight, 10) || 400;
    return 400;
}
