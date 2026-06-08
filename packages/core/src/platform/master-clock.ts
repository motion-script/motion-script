/** Called every animation frame with the current playhead time (seconds). Must return a Promise so the clock can await all renderers before advancing. */
export type TickCallback = (time: number) => Promise<void>;

/** Fired when playback starts. Receives the time at which playback began, the playback speed multiplier, and whether playback is reversed. */
export type PlayCallback = (time: number, speed: number, reverse: boolean) => void;

/** Fired whenever the playhead position changes. */
export type TimeCallback = (time: number) => void;

/**
 * Platform-agnostic base class for driving animation playback.
 *
 * Subclasses implement the actual frame loop (e.g. requestAnimationFrame in the
 * browser, a setInterval loop in Node) and call `setCurrentTime` / `tick` each
 * frame. `MasterClock` owns the subscriber lists and the shared playback state
 * so that renderers and UI controls can coordinate without knowing about each
 * other.
 *
 * Lifecycle:
 *   1. Set total duration with `setDuration`.
 *   2. Register listeners via `onTick` / `onPlay` / `onPause` / `onTime`.
 *   3. Call `play`, `pause`, or `seek` to control playback.
 *   4. Call `dispose` when the clock is no longer needed to prevent leaks.
 */
export abstract class MasterClock {
    private _isPlaying: boolean = false;
    private _currentTime: number = 0;
    protected _duration: number = 0;

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /** Current playhead position in seconds. */
    get currentTime(): number {
        return this._currentTime;
    }

    /** Total animation duration in seconds. */
    get duration(): number {
        return this._duration;
    }

    setDuration(duration: number): void {
        this._duration = duration;
    }

    /** Updates the playhead and notifies time listeners. No-ops if the time hasn't changed. */
    protected setCurrentTime(t: number): void {
        if (this._currentTime === t) return;
        this._currentTime = t;
        for (const cb of this.timeCallbacks) cb(t);
    }

    protected setPlaying(playing: boolean): void {
        this._isPlaying = playing;
    }

    /** Starts playback at the given speed and direction, notifying all play listeners. */
    play(speed: number, reverse: boolean): void {
        this._isPlaying = true;
        for (const cb of this.playCallbacks) cb(this._currentTime, speed, reverse);
    }

    /** Awaits all tick callbacks in parallel. Subclasses call this once per frame after updating `currentTime`. */
    protected async tick(): Promise<void> {
        await Promise.all(this.tickCallbacks.map(c => c(this._currentTime)));
    }

    /** Pauses playback and notifies all pause listeners. */
    pause(): void {
        this._isPlaying = false;
        for (const cb of this.pauseCallbacks) cb();
    }

    /** Moves the playhead to `t` (seconds). Subclasses decide whether this also triggers a tick. */
    abstract seek(t: number): void;

    protected tickCallbacks: TickCallback[] = [];
    protected playCallbacks: PlayCallback[] = [];
    protected pauseCallbacks: (() => void)[] = [];
    protected timeCallbacks: TimeCallback[] = [];

    /** Clears all registered callbacks. Call when tearing down a scene to avoid memory leaks. */
    dispose() {
        this.tickCallbacks.length = 0;
        this.playCallbacks.length = 0;
        this.pauseCallbacks.length = 0;
        this.timeCallbacks.length = 0;
    }

    onTick(callback: TickCallback) {
        this.tickCallbacks.push(callback);
    }

    onPlay(callback: PlayCallback) {
        this.playCallbacks.push(callback);
    }

    onPause(callback: () => void) {
        this.pauseCallbacks.push(callback);
    }

    onTime(callback: TimeCallback) {
        this.timeCallbacks.push(callback);
    }
}
