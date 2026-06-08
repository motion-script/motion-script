import { AudioDevice, AudioRequest } from "@motion-script/core";

type ActiveSource = {
    source: AudioBufferSourceNode;
    gainNode: GainNode;
    request: AudioRequest;
};

/**
 * Web Audio implementation of {@link AudioDevice} — decodes and caches source
 * buffers, then schedules/plays {@link AudioRequest}s as `AudioBufferSourceNode`s
 * through a shared master gain (for global mute). `schedule` registers the
 * active set of requests for the current frame; `syncTo` then starts/stops
 * sources to match `sceneTime`, so playback follows scrubbing and seeks.
 */
export class WebAudioDevice extends AudioDevice {
    private context: AudioContext;
    private ownsContext: boolean;
    private bufferCache = new Map<string, AudioBuffer>();
    private decoding = new Map<string, Promise<void>>();
    private active = new Map<string, ActiveSource>();
    private scheduled: AudioRequest[] = [];
    private disposed: boolean = false;
    private masterGain: GainNode;
    private muted = false;

    constructor(context?: AudioContext) {
        super();
        this.context = context ?? new AudioContext();
        this.ownsContext = !context;
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
    }

    getContext(): AudioContext {
        return this.context;
    }

    /**
     * Resume the AudioContext. Must be called from within a user gesture
     * (e.g. a click handler) the first time, or browsers keep the context
     * suspended and no audio is heard.
     */
    unlock(): void {
        if (this.context.state === "suspended") {
            this.context.resume();
        }
    }

    has(src: string): boolean {
        return this.bufferCache.has(src);
    }

    async append(src: string, data: ArrayBuffer): Promise<void> {
        if (this.bufferCache.has(src)) return;
        const existing = this.decoding.get(src);
        if (existing) return existing;

        // decodeAudioData detaches `data` — that's fine, the caller in
        // AssetManager.fetchAudio discards its reference immediately after
        // awaiting append. Skipping the defensive .slice(0) saves a multi-MB
        // allocation per audio source.
        const job = this.context.decodeAudioData(data).then((buffer) => {
            this.bufferCache.set(src, buffer);
        }).finally(() => {
            this.decoding.delete(src);
        });
        this.decoding.set(src, job);
        await job;
    }

    /** Drops cached buffers and stops active sources for srcs/requests no longer referenced — called when the asset set changes (e.g. seeking across scene boundaries). */
    retain(keep: ReadonlySet<string>): void {
        for (const src of [...this.bufferCache.keys()]) {
            if (!keep.has(src)) this.bufferCache.delete(src);
        }
        for (const [id, active] of this.active) {
            if (!keep.has(active.request.src)) this.stopSource(id, active);
        }
    }

    /** Replaces the active request set; stops any currently-playing source whose request is no longer scheduled. Actual start/stop-to-match-time happens in `syncTo`. */
    schedule(requests: readonly AudioRequest[]): void {
        const next = new Set(requests.map(r => r.id));
        for (const [id, active] of this.active) {
            if (!next.has(id)) this.stopSource(id, active);
        }
        this.scheduled = requests.slice();
    }

    /** Starts sources whose `[startAt, endAt)` window now contains `sceneTime` (computing the correct buffer offset for the seek point) and stops any that have fallen outside it. */
    syncTo(sceneTime: number): void {
        const liveIds = new Set<string>();

        for (const req of this.scheduled) {
            const end = req.endAt ?? Infinity;
            const isInWindow = sceneTime >= req.startAt && sceneTime < end;
            if (!isInWindow) continue;

            liveIds.add(req.id);
            if (!this.active.has(req.id)) {
                const buffer = this.bufferCache.get(req.src);
                if (buffer) this.playBuffer(buffer, req, sceneTime);
            }
        }

        for (const [id, active] of this.active) {
            if (!liveIds.has(id)) this.stopSource(id, active);
        }
    }

    async play(time: number, _speed: number, _reverse: boolean): Promise<void> {
        if (this.context.state === "suspended") {
            await this.context.resume();
        }
        this.syncTo(time);
    }

    stop(): void {
        for (const [id, active] of this.active) {
            this.stopSource(id, active);
        }
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.masterGain.gain.value = muted ? 0 : 1;
    }

    /** Starts a buffer source mid-clip if `sceneTime` lands after the request's start — `audioOffset` accounts for both the request's trim and the elapsed time since `startAt`. */
    private playBuffer(buffer: AudioBuffer, req: AudioRequest, sceneTime: number): void {
        const gainNode = this.context.createGain();
        gainNode.gain.value = req.volume;
        gainNode.connect(this.masterGain);

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = req.loop;
        source.connect(gainNode);

        const elapsed = sceneTime - req.startAt;
        const audioOffset = req.trimStart + Math.max(0, elapsed);

        source.start(0, audioOffset);

        source.onended = () => {
            if (this.active.get(req.id)?.source === source) {
                this.active.delete(req.id);
            }
        };

        this.active.set(req.id, { source, gainNode, request: req });
    }

    private stopSource(id: string, active: ActiveSource): void {
        try {
            active.source.onended = null;
            active.source.stop();
            active.source.disconnect();
            active.gainNode.disconnect();
        } catch {
            // already stopped
        }
        this.active.delete(id);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        super.dispose();
        this.bufferCache.clear();
        this.decoding.clear();
        this.scheduled.length = 0;
        try {
            this.masterGain.disconnect();
        } catch {
            // already disconnected
        }
        if (this.ownsContext && this.context.state !== "closed") {
            this.context.close();
        }
    }
}
