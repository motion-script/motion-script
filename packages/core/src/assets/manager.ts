import { AudioRequest } from "@/attributes/audio/request";
import { Disposer } from "@/assets/record";
import { AudioDevice } from "@/platform/audio-device";
import { StorageAdapter } from "@/platform/storage-adapter";
import { AssetTrack, PrecompResult } from "@/runtime/precompisition";

/**
 * Coordinates asset loading and audio synchronization during playback.
 * Wraps a {@link PrecompResult} and delegates storage/audio work to platform adapters.
 */
export class AssetManager {
    private readonly precomp: PrecompResult;
    private readonly storageAdapter: StorageAdapter;
    private readonly audioDevice: AudioDevice;

    private lastAudioRequestKey: string = "";
    private lastAudioSrcs: ReadonlySet<string> = new Set();
    private audioFetching = new Map<string, Promise<void>>();

    /** Disposers for loaders whose load has resolved, keyed by loader key. */
    private loaderDisposers = new Map<string, Disposer>();
    /** In-flight loader runs, keyed by loader key, to dedupe concurrent calls. */
    private loaderInFlight = new Map<string, Promise<void>>();

    constructor(
        precomp: PrecompResult,
        storageAdapter: StorageAdapter,
        audioDevice: AudioDevice,
    ) {
        this.precomp = precomp;
        this.storageAdapter = storageAdapter;
        this.audioDevice = audioDevice;
    }

    // ─── Public surface ───────────────────────────────────────────────────────

    /**
     * Blocking load for seek and initial render. Waits for every asset whose
     * cacheAt <= frame and endFrame >= frame to be ready, then schedules audio.
     */
    async loadAt(frame: number): Promise<void> {
        const jobs: Promise<void>[] = [];

        for (const [key, track] of this.precomp.assets) {
            if (track.record.type === 'loader') {
                const job = this.syncLoader(key, track, frame);
                if (job) jobs.push(job);
                continue;
            }
            if (track.cacheAt <= frame && track.record.endFrame >= frame) {
                jobs.push(this.storageAdapter.loadAsset(key, track.record));
            }
        }

        await Promise.all(jobs);
        this.syncAudio(frame);
    }

    /**
     * Non-blocking incremental prefetch called after each render tick. Fires
     * loads for assets whose cacheAt window has been reached without blocking.
     */
    prefetch(frame: number): void {
        for (const [key, track] of this.precomp.assets) {
            if (track.record.type === 'loader') {
                this.syncLoader(key, track, frame)?.catch(err => {
                    console.error(`[AssetManager] loader failed for ${key}:`, err);
                });
                continue;
            }
            if (track.cacheAt <= frame && track.record.endFrame >= frame) {
                this.storageAdapter.loadAsset(key, track.record).catch(err => {
                    console.error(`[AssetManager] prefetch failed for ${key}:`, err);
                });
            }
        }
    }

    /**
     * Drive a single loader track toward the state `frame` requires. If `frame`
     * is inside the loader's `[cacheAt, discardAt]` window, run its callback
     * (deduped — at most one in-flight run, skipped once loaded) and return the
     * pending job, if any. If `frame` is outside the window and the loader was
     * loaded, dispose it. Returns the in-flight load promise so a blocking
     * caller can await it; `undefined` when there's nothing to wait for.
     */
    private syncLoader(key: string, track: AssetTrack, frame: number): Promise<void> | undefined {
        if (track.record.type !== 'loader') return undefined;
        const discardAt = track.discardAt ?? Infinity;
        const inWindow = track.cacheAt <= frame && frame <= discardAt;

        if (!inWindow) {
            const dispose = this.loaderDisposers.get(key);
            if (dispose) {
                this.loaderDisposers.delete(key);
                dispose();
            }
            return undefined;
        }

        // Already loaded for this window, or a run is already in flight.
        if (this.loaderDisposers.has(key)) return undefined;
        const existing = this.loaderInFlight.get(key);
        if (existing) return existing;

        const load = track.record.load;
        const job = load()
            .then(disposer => {
                this.loaderDisposers.set(key, disposer);
            })
            .finally(() => {
                this.loaderInFlight.delete(key);
            });
        this.loaderInFlight.set(key, job);
        return job;
    }

    /** Run every outstanding loader disposer and clear loader state. */
    dispose(): void {
        for (const dispose of this.loaderDisposers.values()) dispose();
        this.loaderDisposers.clear();
        this.loaderInFlight.clear();
    }

    /**
     * Push the current audio working set to the AudioDevice. Called after each
     * render tick so the device stays in sync with the scene's audio requests.
     */
    syncAudio(frame: number): void {
        const currentTime = frame / this.precomp.fps;

        const inWindow: AudioRequest[] = [];
        const srcs = new Set<string>();
        const seen = new Set<string>();

        for (const scene of this.precomp.scenes) {
            const sceneOffsetSecs = scene.startFrame / this.precomp.fps;

            for (const req of scene.audioRequests) {
                const globalStart = sceneOffsetSecs + req.startAt;
                const globalEnd = sceneOffsetSecs + req.endAt;

                if (globalEnd < currentTime || globalStart > currentTime + 10) continue;

                const stableId = stableKey(req, sceneOffsetSecs);
                if (seen.has(stableId)) continue;
                seen.add(stableId);

                inWindow.push({ ...req, id: stableId, startAt: globalStart, endAt: globalEnd });
                srcs.add(req.src);
            }
        }

        for (const src of srcs) {
            if (!this.audioDevice.has(src) && !this.audioFetching.has(src)) {
                const job = this.storageAdapter.fetchAudioData(src)
                    .then(data => this.audioDevice.append(src, data))
                    .finally(() => this.audioFetching.delete(src));
                this.audioFetching.set(src, job);
            }
        }

        const requestKey = audioSignature(inWindow);
        if (requestKey !== this.lastAudioRequestKey) {
            this.audioDevice.schedule(inWindow);
            this.lastAudioRequestKey = requestKey;
        }
        if (!setsEqual(this.lastAudioSrcs, srcs)) {
            this.audioDevice.retain(srcs);
            this.lastAudioSrcs = srcs;
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produce a deterministic string key that uniquely identifies an audio request's playback identity. */
function stableKey(req: AudioRequest, sceneOffsetSecs: number): string {
    return `${req.src}|${sceneOffsetSecs + req.startAt}|${sceneOffsetSecs + req.endAt}|${req.trimStart}|${req.loop ? 1 : 0}|${req.volume}`;
}

/** Produce a stable hash of the active audio request set to detect scheduling changes. */
function audioSignature(reqs: readonly AudioRequest[]): string {
    if (reqs.length === 0) return "";
    return reqs.map(r => r.id).sort().join("\n");
}

/** Shallow equality check for two string sets (order-independent). */
function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}
