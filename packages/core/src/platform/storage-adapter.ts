import { AssetCatalog } from "@/assets/catalog";
import { AssetRecord } from "@/assets/record";
import { Size2D } from "@/attributes/layout/size";

export abstract class StorageAdapter {
    protected catalog: AssetCatalog;
    protected viewport: Size2D;
    constructor(catalog: AssetCatalog, viewport: Size2D) {
        this.catalog = catalog;
        this.viewport = viewport;
    }

    /**
     * Point the adapter at a different asset catalog, keeping every decode it has
     * already cached.
     *
     * Safe because the catalog supplies *metadata* (durations, intrinsic sizes)
     * while the caches are keyed by source URL: a src the new catalog drops leaves
     * an orphaned decode, and a src it adds simply isn't cached yet. Neither is a
     * correctness problem, which is what lets a long-lived renderer take an
     * updated manifest without paying to re-decode everything still in use.
     *
     * The viewport deliberately has no such setter — it clamps the resolution
     * images are decoded *at*, so changing it makes cached decodes genuinely
     * wrong, and the adapter has to be rebuilt.
     */
    setCatalog(catalog: AssetCatalog): void {
        this.catalog = catalog;
    }
    /**
     * Every asset src whose loadXxx is currently in flight, mapped to its
     * pending promise. The render path awaits these to guarantee no draw
     * happens while a load is still resolving. Cleared on completion.
     */
    protected inFlightLoads = new Map<string, Promise<void>>();
    /** Keys of assets that have been fully loaded and are ready to use. */
    protected cachedAssets = new Set<string>();

    // ─── Asset loading dispatch ───────────────────────────────────────────────

    async loadAsset(key: string, value: AssetRecord): Promise<void> {
        const existing = this.inFlightLoads.get(key);
        if (existing) return existing;
        if (this.cachedAssets.has(key)) return;

        const job = this.runLoad(key, value);
        this.inFlightLoads.set(key, job);
        try {
            await job;
        } finally {
            this.inFlightLoads.delete(key);
        }
    }

    private async runLoad(key: string, value: AssetRecord): Promise<void> {
        let loaded = true;
        switch (value.type) {
            case 'image':
                await this.loadImage(key, value.width, value.height);
                break;
            case 'video':
                await this.loadVideo(key, value.startFrame, value.endFrame, value.width, value.height, value.trimStart, value.trimEnd);
                break;
            case 'font': {
                const { fontFamily, fontWeight } = this.parseFontKey(key);
                loaded = await this.loadFont(key, fontFamily, fontWeight);
                break;
            }
            case 'audio':
                // Audio files are loaded on-demand via fetchAudioData / syncAudio, not through loadAsset.
                break;
            case 'loader':
                // Loaders are opaque callbacks run directly by the AssetManager and
                // never dispatched through the storage adapter.
                throw new Error("Loader records must not be routed through StorageAdapter.loadAsset");
            default: {
                const _exhaustive: never = value;
                throw new Error(`Unsupported asset type: ${(_exhaustive as AssetRecord).type}`);
            }
        }

        // Only a load that actually happened is cached. This matters for exactly
        // one case: a font family the manifest cannot describe. Caching it anyway
        // marked the family handled for the life of this adapter, so a manifest
        // that *later* described it — which is what installing a typeface does,
        // folded into the live manifest without rebuilding the controller — could
        // never load it, and the text stayed in the fallback face until something
        // else tore the adapter down.
        if (loaded) this.cachedAssets.add(key);
    }

    // ─── Font key parsing ─────────────────────────────────────────────────────

    protected parseFontKey(key: string): { fontFamily: string; fontWeight: number } {
        const [fontFamily, weightStr] = key.split('@');
        const fontWeight = weightStr ? parseInt(weightStr, 10) : 400;
        return {
            fontFamily: fontFamily || key,
            fontWeight: isNaN(fontWeight) ? 400 : fontWeight,
        };
    }

    // ─── Abstract load methods ────────────────────────────────────────────────

    abstract loadImage(src: string, width: number, height: number): Promise<void>;
    abstract loadVideo(
        src: string,
        startFrame: number,
        endFrame: number,
        width: number,
        height: number,
        trimStart: number,
        trimEnd?: number,
    ): Promise<void>;
    abstract loadAudio(
        src: string,
        startFrame: number,
        endFrame: number,
        trimStart: number,
        trimEnd?: number,
    ): Promise<void>;
    abstract fetchAudioData(src: string): Promise<ArrayBuffer>;
    /**
     * Register every face of `fontFamily` the catalog describes.
     *
     * Returns whether the family was actually loaded. `false` means the manifest
     * has no entry for it — not an error (an undescribed family shapes against
     * the platform fallback, which is what a system font name does), but it must
     * not be remembered as handled: see the note in {@link runLoad}.
     */
    abstract loadFont(src: string, fontFamily: string, fontWeight: number): Promise<boolean>;

    // ─── Frame warming ────────────────────────────────────────────────────────

    /**
     * Decode any exact media frames the most recent render asked for but couldn't
     * satisfy synchronously (e.g. a video frame at a freshly-seeked timestamp),
     * and report whether there were any. A blocking caller (seek / screenshot /
     * export) renders once, awaits this, and re-renders while it returns true so
     * the frame is accurate even on a cold jump. Defaults to a no-op for adapters
     * with no time-varying media.
     */
    async warmPendingVideo(): Promise<boolean> {
        return false;
    }

    /**
     * Notify the adapter whether playback is live. Time-varying media (video) uses
     * this to prefetch ahead only while playing and to quiesce on pause, so a
     * paused timeline doesn't drain a backlog of stale decodes. No-op by default.
     */
    setPlaying(_playing: boolean): void {
        // no-op for adapters with no time-varying media
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    dispose(): void {
        this.inFlightLoads.clear();
        this.cachedAssets.clear();
    }
}
