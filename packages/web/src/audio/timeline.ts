import {
    AssetCatalog, ManifestAssetCatalog,
    audioTimelineDuration,
    resolveGlobalAudio,
    type AssetManifest,
    type AudioRequest,
    type AudioTrack,
    type WaveformInfo,
} from "@motion-script/core";
import type { ScheduledAudioRequest } from "@motion-script/skia-render/export";
import { WebMasterClock } from "../master-clock";
import { WebAudioDevice } from "./player";
import { encodeWav, mixAudio, type MixAudioOptions } from "./mixer";

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

export interface AudioTimelineOptions {
    /** The clips to stack, in project seconds. See {@link AudioTrack}. */
    tracks?: readonly AudioTrack[];
    /** Metadata for the sources — clip lengths come from here. */
    manifest?: AssetManifest;
    /**
     * Timeline length in seconds. Defaults to the furthest point any non-looping
     * track reaches (`audioTimelineDuration`). Required if every track loops,
     * since a looping track has no end of its own.
     */
    duration?: number;
    /**
     * Tick rate for playback. Clip starts land on these boundaries, so a higher
     * value tightens start accuracy at the cost of more ticks. Defaults to 60.
     */
    fps?: number;
    /** Share an existing `AudioContext` (e.g. one already unlocked by a gesture). */
    context?: AudioContext;
}

export interface MixdownOptions extends MixAudioOptions {
    /**
     * `"buffer"` (default) returns the raw `AudioBuffer`; `"wav"` encodes it as
     * 16-bit PCM bytes ready to upload or download.
     */
    as?: "buffer" | "wav";
}

/**
 * A standalone stack of audio clips on a timeline — play, scrub and mix down,
 * with no scenes and nothing rendered.
 *
 * The engine can already do this, but only as a side effect of a project: beds
 * are resolved during the scene precomp and clipped to a duration the scenes
 * decide. This composes the same parts — `resolveGlobalAudio` for the clip
 * geometry, {@link WebAudioDevice} for playback, {@link mixAudio} for the
 * offline mix — against a duration derived from the tracks themselves, so a
 * host can build an audio timeline before it has any scenes to attach it to.
 *
 * ```ts
 * const audio = await createAudioTimeline({ tracks, manifest });
 * audio.onTime(t => setPlayhead(t));
 * audio.unlock();               // from a click handler
 * await audio.play();
 * const wav = await audio.mixdown({ as: "wav" });
 * ```
 *
 * Reuses {@link AudioTrack} rather than inventing a clip type, so a set of
 * tracks previewed here can be handed straight to `createProject({ audioTracks })`.
 *
 * **No CanvasKit.** Nothing here touches the renderer, which is why it lives on
 * the `@motion-script/web/audio` subpath — importing the package barrel would
 * pull in the WASM module for a feature that draws nothing.
 *
 * Two known divergences from the mixdown, both inherited from the live device:
 * clip starts quantize to `1/fps` (the mix schedules at absolute times and is
 * sample-accurate), and a `speed` *curve* is applied during playback but
 * collapses to its static value in the mix.
 */
export class AudioTimeline {
    private readonly device: WebAudioDevice;
    private readonly clock: WebMasterClock;

    private catalog: AssetCatalog;
    private manifest: AssetManifest;
    private tracks: readonly AudioTrack[];
    private explicitDuration?: number;
    private requests: AudioRequest[] = [];
    private errorList: string[] = [];
    private durationValue = 0;
    private loaded = new Set<string>();
    private disposed = false;

    /** @internal Use {@link createAudioTimeline}, which preloads the sources. */
    constructor(options: AudioTimelineOptions = {}) {
        this.manifest = options.manifest ?? EMPTY_MANIFEST;
        this.catalog = new ManifestAssetCatalog(this.manifest);
        this.tracks = options.tracks ?? [];
        this.explicitDuration = options.duration;

        // The device owns the context when we don't pass one, and closes it on
        // dispose; a caller-supplied context stays the caller's.
        this.device = new WebAudioDevice(options.context);
        // One shared context: the clock suspends it to pause, which must be the
        // same context holding the sources or pausing stops nothing.
        this.clock = new WebMasterClock({
            context: this.device.getContext(),
            fps: options.fps ?? 60,
        });

        this.clock.onPlay((time, speed, reverse) => { void this.device.play(time, speed, reverse); });
        this.clock.onPause(() => this.device.stop());
        this.clock.onTick(async (time) => { this.device.syncTo(time); });

        this.resolve();
    }

    /** Timeline length in seconds. */
    get duration(): number { return this.durationValue; }
    get currentTime(): number { return this.clock.currentTime; }
    get isPlaying(): boolean { return this.clock.isPlaying; }

    /**
     * Problems resolving the current tracks — an unknown `src`, an inverted trim.
     * A track that fails is dropped rather than throwing, so check this to tell a
     * silent timeline from a broken one.
     */
    get errors(): readonly string[] { return this.errorList; }

    /** The resolved clips, for a host drawing its own timeline UI. */
    waveforms(): WaveformInfo[] {
        return this.requests.map(req => ({
            src: req.src,
            startTime: req.startAt,
            endTime: req.endAt,
        }));
    }

    /**
     * Resume the `AudioContext`. Must be called from inside a user gesture the
     * first time, or the browser keeps it suspended and nothing is heard.
     */
    unlock(): void { this.device.unlock(); }

    /** Fetch and decode every source the current tracks reference. */
    async load(): Promise<void> {
        this.assertLive();
        const srcs = [...new Set(this.requests.map(r => r.src))].filter(src => !this.loaded.has(src));
        await Promise.all(srcs.map(async (src) => {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`Audio load failed for "${src}": ${response.status} ${response.statusText}`);
            await this.device.append(src, await response.arrayBuffer());
            this.loaded.add(src);
        }));
        // Only after the data is on the device is it eligible to start; scheduling
        // before would let a tick skip a clip whose buffer hadn't landed.
        this.device.schedule(this.requests);
    }

    async play(from?: number): Promise<void> {
        this.assertLive();
        if (from !== undefined) this.clock.seek(from);
        await this.clock.play(1, false);
    }

    pause(): void { this.clock.pause(); }

    seek(time: number): void {
        this.assertLive();
        this.clock.seek(time);
        this.device.syncTo(this.clock.currentTime);
    }

    setMuted(muted: boolean): void { this.device.setMuted(muted); }
    setVolume(volume: number): void { this.device.setVolume(volume); }

    /** Called on every clock tick with the current time in seconds. */
    onTime(callback: (time: number) => void): void { this.clock.onTime(callback); }

    /** Replace the clips, re-resolving and re-scheduling in place. */
    async setTracks(tracks: readonly AudioTrack[]): Promise<void> {
        this.assertLive();
        this.tracks = tracks;
        this.resolve();
        await this.load();
    }

    /** Replace the manifest — call when a source's metadata or URL changes. */
    async setManifest(manifest: AssetManifest): Promise<void> {
        this.assertLive();
        this.manifest = manifest;
        this.catalog = new ManifestAssetCatalog(manifest);
        this.resolve();
        await this.load();
    }

    /**
     * Render the whole timeline to one buffer offline.
     *
     * Independent of playback: it neither needs the context unlocked nor disturbs
     * the playhead, so it is safe to call while playing and deterministic in tests.
     */
    async mixdown(options: MixdownOptions & { as: "wav" }): Promise<Uint8Array>;
    async mixdown(options?: MixdownOptions): Promise<AudioBuffer>;
    async mixdown(options: MixdownOptions = {}): Promise<AudioBuffer | Uint8Array> {
        this.assertLive();
        // Beds carry absolute times already, which is exactly what a zero offset
        // means to the mixer — the same convention `PrecompResult.globalAudio` uses.
        const scheduled: ScheduledAudioRequest[] = this.requests.map(request => ({ request, globalOffset: 0 }));
        const mixed = await mixAudio(scheduled, this.durationValue, options);
        if (!mixed) throw new Error("Nothing to mix down: the timeline has no audible clips.");
        return options.as === "wav" ? encodeWav(mixed) : mixed;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clock.dispose();
        this.device.dispose();
    }

    /** Recompute the duration and the clip set from the current tracks. */
    private resolve(): void {
        this.durationValue = this.explicitDuration ?? audioTimelineDuration(this.tracks, this.catalog);
        const { requests, errors } = resolveGlobalAudio(this.tracks, this.catalog, this.durationValue);
        this.requests = requests;
        this.errorList = errors;
        this.clock.setDuration(this.durationValue);
    }

    private assertLive(): void {
        if (this.disposed) throw new Error("This AudioTimeline has been disposed.");
    }
}

/**
 * Create an {@link AudioTimeline} and preload its sources, so the first `play()`
 * starts immediately rather than dropping the clips it hasn't decoded yet.
 */
export async function createAudioTimeline(
    options: AudioTimelineOptions = {},
): Promise<AudioTimeline> {
    const timeline = new AudioTimeline(options);
    await timeline.load();
    return timeline;
}
