export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'loader';

/** Frees whatever a {@link LoaderFn} loaded. Called when its window is evicted. */
export type Disposer = () => void;

/**
 * An opaque async load owned by the requesting package. Runs the load and
 * resolves with a {@link Disposer} that frees it. The core never inspects what
 * was loaded — this is how a component package (e.g. the code component's Shiki
 * highlighter) loads its own resources without core depending on it.
 */
export type LoaderFn = () => Promise<Disposer>;

// ─── Cached entry types ───────────────────────────────────────────────────────

/** Frame-range entry tracked by {@link AssetTracker} for a single asset. */
interface BaseAssetRecord {
    type: AssetType;
    /** First frame at which this asset is needed. */
    startFrame: number;
    /** Last frame at which this asset is needed; grows as the tracker scans later frames. */
    endFrame: number;
    src: string;
}

export interface ImageRecord extends BaseAssetRecord {
    type: 'image';
    /** Maximum rendered width observed across all frames (used to pick decode resolution). */
    width: number;
    /** Maximum rendered height observed across all frames. */
    height: number;
}

export interface FontRecord extends BaseAssetRecord {
    type: 'font';
    fontWeight: number;
    fontFamily: string;
}

export interface VideoRecord extends BaseAssetRecord {
    type: 'video';
    /** Maximum rendered width observed across all frames. */
    width: number;
    /** Maximum rendered height observed across all frames. */
    height: number;
    trimStart: number;  // seconds; default 0
    trimEnd: number;    // seconds; default is end of video (manifest duration)
}

export interface AudioRecord extends BaseAssetRecord {
    type: 'audio';
    trimStart: number;  // seconds; default 0
    trimEnd: number;    // seconds; default is end of audio (manifest duration)
}

/**
 * A generic, opaque async load tracked on the timeline like any other asset.
 * Unlike images/fonts/etc. it isn't dispatched by {@link StorageAdapter}; the
 * {@link AssetManager} runs {@link load} directly when the frame window opens
 * and calls the returned {@link Disposer} when it evicts. `src` is the dedupe
 * key (e.g. `lang:java|github-dark`).
 */
export interface LoaderRecord extends BaseAssetRecord {
    type: 'loader';
    load: LoaderFn;
}

/** Union of all per-type cached entry shapes. */
export type AssetRecord = ImageRecord | FontRecord | VideoRecord | AudioRecord | LoaderRecord;