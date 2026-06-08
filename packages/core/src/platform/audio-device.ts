import type { AudioRequest } from "@/attributes/audio/request";


/**
 * Stackable audio player driven by the AssetManager.
 *
 * The AssetManager decides which audio data is needed within the current
 * look-ahead window and pushes it in via {@link append}; the device caches the
 * decoded form, schedules the matching {@link AudioRequest}s via
 * {@link schedule}, and drives playback through {@link syncTo} on each tick.
 */
export abstract class AudioDevice {
    /** True if decoded data for `src` is already cached on the device. */
    abstract has(src: string): boolean;

    /**
     * Decode and stack `data` under `src`. Idempotent — repeat calls for an
     * already-cached `src` are no-ops.
     */
    abstract append(src: string, data: ArrayBuffer): Promise<void>;

    /** Drop cached audio data (and any active sources) for srcs not in `keep`. */
    abstract retain(keep: ReadonlySet<string>): void;

    /**
     * Set the working set of audio requests for the current look-ahead window.
     * Requests no longer present are stopped; new ones become eligible for
     * playback via {@link syncTo} as soon as their data is appended.
     */
    abstract schedule(requests: readonly AudioRequest[]): void;

    /**
     * Start/stop scheduled sources to match `sceneTime`. Called every tick.
     * Sources whose data has not yet been appended are skipped until it is.
     */
    abstract syncTo(sceneTime: number): void;

    abstract play(time: number, speed: number, reverse: boolean): void | Promise<void>;
    abstract stop(): void;

    /**
     * Mute or unmute all output. Default is a no-op for devices that produce no
     * sound (e.g. export/noop sinks).
     */
    setMuted(_muted: boolean): void {}

    dispose(): void {
        this.stop();
    }
}
