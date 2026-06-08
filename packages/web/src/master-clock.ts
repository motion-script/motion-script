import { MasterClock } from "@motion-script/core";

/**
 * MasterClock backed by a Web Audio AudioContext. Scene time advances in
 * lock-step with `audioContext.currentTime`, so any AudioBufferSourceNodes
 * scheduled on the same context play perfectly in sync.
 *
 * When paused we suspend the context (audio stops, currentTime freezes);
 * when playing we resume and a rAF loop publishes ticks at the target fps.
 *
 * A single silent buffer covering the full timeline is started on play(),
 * which keeps the context active and gives the browser a stable audio
 * graph to schedule against even on scenes that contain no audio nodes.
 */
export class WebMasterClock extends MasterClock {
    private context: AudioContext;
    private ownsContext: boolean;
    private fps: number;

    private playStartCtxTime: number = 0;
    private seekOffset: number = 0;
    private speed: number = 1;
    private reverse: boolean = false;

    private rafId: number | null = null;
    private silentSource: AudioBufferSourceNode | null = null;

    constructor(opts: { context?: AudioContext; fps: number }) {
        super();
        this.context = opts.context ?? new AudioContext();
        this.ownsContext = !opts.context;
        this.fps = opts.fps;
    }

    getContext(): AudioContext {
        return this.context;
    }

    seek(t: number): void {
        const clamped = Math.max(0, Math.min(t, this.duration));
        this.seekOffset = clamped;
        this.playStartCtxTime = this.context.currentTime;
        this.setCurrentTime(clamped);
    }

    /** Resumes the (possibly suspended) context, anchors elapsed-time tracking to the current `context.currentTime`, and starts the silent ticker + rAF tick loop. */
    async play(speed: number = 1, reverse: boolean = false): Promise<void> {
        this.speed = speed;
        this.reverse = reverse;
        this.seekOffset = this.currentTime;

        if (this.context.state === "suspended") {
            await this.context.resume();
        }

        this.playStartCtxTime = this.context.currentTime;
        this.startSilentTicker();
        super.play(speed, reverse);
        this.startLoop();
    }

    /** Stops the tick loop and silent ticker, then suspends the context — freezing `currentTime` so elapsed-time math stays correct across the pause. */
    pause(): void {
        this.seekOffset = this.currentTime;
        this.stopLoop();
        this.stopSilentTicker();
        if (this.context.state === "running") {
            this.context.suspend();
        }
        super.pause();
    }

    /** (Re)starts the silent buffer source covering the remaining timeline — keeps the AudioContext active and gives a stable graph for other AudioBufferSourceNodes to schedule against, per the class-level note. */
    private startSilentTicker(): void {
        this.stopSilentTicker();
        const remaining = Math.max(0.001, this.duration - this.seekOffset);
        const sampleRate = this.context.sampleRate;
        const buffer = this.context.createBuffer(1, Math.ceil(remaining * sampleRate), sampleRate);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        source.start();
        this.silentSource = source;
    }

    private stopSilentTicker(): void {
        if (this.silentSource) {
            try {
                this.silentSource.onended = null;
                this.silentSource.stop();
                this.silentSource.disconnect();
            } catch {
                // already stopped
            }
            this.silentSource = null;
        }
    }

    /** Drives ticks off `requestAnimationFrame`, deriving scene time from elapsed `context.currentTime` (so it stays sample-accurate) and only firing `tick()` when a full frame interval has elapsed. */
    private startLoop(): void {
        if (this.rafId !== null) return;
        const frameDt = 1 / this.fps;
        let lastTickTime = this.currentTime;

        const loop = async () => {
            const elapsed = (this.context.currentTime - this.playStartCtxTime) * this.speed;
            const next = this.reverse
                ? this.seekOffset - elapsed
                : this.seekOffset + elapsed;
            const clamped = Math.max(0, Math.min(next, this.duration));
            this.setCurrentTime(clamped);

            if (Math.abs(clamped - lastTickTime) >= frameDt) {
                lastTickTime = clamped;
                // Await so that a slow tick (asset load on a scene
                // boundary) doesn't queue a second concurrent tick.
                await this.tick();
            }

            const ended = this.reverse ? clamped <= 0 : clamped >= this.duration;
            if (ended) {
                this.rafId = null;
                return;
            }
            // If pause() cleared the rafId while we were awaiting tick(),
            // do not resume the loop.
            if (this.rafId === null) return;
            this.rafId = requestAnimationFrame(loop);
        };

        this.rafId = requestAnimationFrame(loop);
    }

    private stopLoop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    dispose(): void {
        this.stopLoop();
        this.stopSilentTicker();
        if (this.ownsContext) {
            this.context.close();
        }
        super.dispose();
    }
}
