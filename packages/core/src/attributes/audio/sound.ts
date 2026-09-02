import { AssetTracker } from "@/assets/tracker";
import { AudioRequest } from "@/attributes/audio/request";
import { AudioFilterItem } from "@/attributes/audio/filters/union";
import { AudioFilter, resolveAudioFilters } from "@/attributes/audio/filters/chain";
import { isCurve, integrateSpeedToSceneTime } from "@/attributes/audio/filters/curve";

interface SoundPropsBase {
    src: string;
    volume?: number;
    loop?: boolean;
    /** Audio filters applied to the clip (gain, eq, tremolo, speed, echo). */
    filters?: AudioFilter;
}

/**
 * Author-facing sound props. Two mutually-exclusive ways to bound the clip:
 *
 * - `{ trimStart?, trimEnd? }` — explicit in/out points into the source file.
 * - `{ duration? }` — syntax sugar for a clip that runs `duration` seconds from
 *   the start (equivalent to `trimStart: 0, trimEnd: duration`).
 *
 * When neither `trimEnd` nor `duration` is given, the clip runs to the source's
 * full length (resolved from the asset catalog). `trimStart` defaults to 0.
 */
export type SoundProps =
    | (SoundPropsBase & { trimStart?: number; trimEnd?: number; duration?: undefined })
    | (SoundPropsBase & { duration?: number; trimStart?: undefined; trimEnd?: undefined });

/** Canonical, fully-resolved sound props. `trimEnd` is resolved against the catalog. */
export interface ResolvedSoundProps {
    src: string;
    volume?: number;
    loop?: boolean;
    trimStart?: number;
    trimEnd?: number;
    filters?: AudioFilterItem[];
}

/**
 * A playable audio clip. Deliberately *not* a {@link Node2D} — audio lives on a
 * parallel timeline, not in the visual scene graph.
 *
 * Wire it up by calling {@link tick} from your node or scene's tick(), then call
 * {@link prepare} from prepare() to register requests with the asset tracker.
 * Use {@link start}/{@link stop}; {@link clipDuration} reports how long it runs.
 */
export class Sound {
    readonly src: string;
    volume: number;
    loop: boolean;
    trimStart: number;
    trimEnd: number;
    filters: AudioFilterItem[];

    private _currentTime: number = 0;
    private _requests: AudioRequest[] = [];
    private _activeId: string | null = null;

    constructor(props: SoundProps) {
        this.src = props.src;
        this.volume = props.volume ?? 1;
        this.loop = props.loop ?? false;
        // `duration` is sugar for `trimStart: 0, trimEnd: duration`.
        this.trimStart = props.trimStart ?? 0;
        this.trimEnd = props.trimEnd ?? props.duration ?? Infinity;
        this.filters = resolveAudioFilters(props.filters);
    }

    /** Update the sound's current time. Call from your node's tick(time). */
    tick(time: number): void {
        this._currentTime = time;
    }

    /**
     * Net constant playback-rate multiplier from any *scalar* `speed` filters
     * (product of all), defaulting to 1. Curve-valued speed filters contribute 1
     * here — they're handled by {@link sceneDurationFor} via integration, not a
     * simple division. A clip of source length `L` occupies `L / effectiveSpeed`
     * seconds of scene time when every speed is scalar.
     */
    effectiveSpeed(): number {
        let speed = 1;
        for (const f of this.filters) {
            if (f.type === "speed" && !isCurve(f.value) && f.value > 0) speed *= f.value;
        }
        return speed;
    }

    /** True if any speed filter is a time-varying curve (duration needs integration). */
    private hasSpeedCurve(): boolean {
        return this.filters.some((f) => f.type === "speed" && isCurve(f.value));
    }

    /**
     * Scene-time length consumed by playing `trimmedSourceLength` seconds of source.
     *
     * - All speeds scalar → `trimmedSourceLength / effectiveSpeed()` (fast path,
     *   unchanged behavior).
     * - A speed *curve* is present → numerically integrate `∫ 1/speed(τ) dτ` over the
     *   trimmed source length. Scalar speed filters are folded in by dividing the
     *   integral by their product (they scale the rate uniformly).
     *
     * This is the single source of truth for how much scene time a clip occupies and
     * must match the renderer's `playbackRate` schedule.
     */
    sceneDurationFor(trimmedSourceLength: number): number {
        const scalar = this.effectiveSpeed();
        if (!this.hasSpeedCurve()) {
            return trimmedSourceLength / scalar;
        }
        const curveFilter = this.filters.find(
            (f): f is Extract<AudioFilterItem, { type: "speed" }> => f.type === "speed" && isCurve(f.value),
        );
        // hasSpeedCurve() guarantees this exists and that value is a Curve.
        const curve = curveFilter!.value;
        if (!isCurve(curve)) return trimmedSourceLength / scalar;
        return integrateSpeedToSceneTime(curve, trimmedSourceLength) / scalar;
    }

    /**
     * The scene-time ranges this sound has been scheduled to play, derived from
     * its accumulated requests. `endAt` is null while a clip is still open
     * (started but not yet stopped, or an unbounded loop).
     */
    get playRanges(): Array<{ startAt: number; endAt: number | null }> {
        return this._requests.map((r) => ({
            startAt: r.startAt,
            endAt: r.endAt === Infinity ? null : r.endAt,
        }));
    }

    /** Start playback. No-op if already playing. */
    start(): void {
        if (this._activeId !== null) return;
        const startAt = this._currentTime;
        const id = `${this.src}|${startAt}|${this._requests.length}`;
        // A speed change (scalar or curve) shrinks/grows how much scene time the clip occupies.
        const endAt = this.trimEnd !== Infinity
            ? startAt + this.sceneDurationFor(Math.max(0, this.trimEnd - this.trimStart))
            : Infinity;
        this._requests.push({
            id,
            src: this.src,
            startAt,
            endAt,
            volume: this.volume,
            loop: this.loop,
            trimStart: this.trimStart,
            filters: this.filters.length > 0 ? this.filters : undefined,
        });
        this._activeId = id;
    }

    /** Stop playback. No-op if not playing. */
    stop(): void {
        if (this._activeId === null) return;
        const req = this._requests.find(r => r.id === this._activeId);
        if (req) {
            req.endAt = this._currentTime;
            // An explicit stop bounds the clip: it must NOT be treated as a
            // cross-scene "open" request. Clear any open marker a prior `prepare`
            // pass set while the clip was still running, or `assembleTimeline` would
            // re-extend its end past the stop point and across later scenes.
            req.open = false;
            req.mediaDuration = undefined;
        }
        this._activeId = null;
    }

    /**
     * The clip's own length in scene seconds, or `undefined` when it is
     * unbounded (a loop, or a source whose length nothing has resolved).
     *
     * What `play()` used to block for. A timeline places a `play` command at a
     * time and gives it a duration, so the blocking form has nothing left to do —
     * but the length itself is still what a host wants when it drops a clip on
     * the timeline and asks how wide the bar should be.
     */
    get clipDuration(): number | undefined {
        // The clip's scene-time length is its trimmed source length scaled by the
        // speed profile (2x speed -> half as long; a curve integrates).
        return this.trimEnd !== Infinity
            ? this.sceneDurationFor(this.trimEnd - this.trimStart)
            : undefined;
    }

    /**
     * Register this sound's requests with the asset tracker. Call from your node's
     * prepare(tracker). Handles file-load registration and pushes new playback
     * requests — safe to call every frame (deduplicated internally).
     */
    prepare(tracker: AssetTracker): void {
        tracker.addAudio(this.src);
        for (const req of this._requests) {
            if (req.endAt === Infinity && !req.loop) {
                if (this.trimEnd !== Infinity) {
                    // Finite-trimmed but never explicitly stopped: bounded to its clip length.
                    const trimmed = Math.max(0, this.trimEnd - this.trimStart);
                    req.endAt = req.startAt + this.sceneDurationFor(trimmed);
                } else {
                    // Untrimmed and never stopped: an OPEN request. Leave `endAt`
                    // unresolved (Infinity) and carry the clip's natural SCENE-time
                    // length (source length scaled by the speed profile) so
                    // assembleTimeline can resolve the end against the project total,
                    // letting the sound continue across scene boundaries.
                    const sourceLen = Math.max(0,
                        tracker.catalog.getMediaDuration(this.src) - this.trimStart,
                    );
                    req.open = true;
                    req.mediaDuration = this.sceneDurationFor(sourceLen);
                }
            } else if (req.endAt === Infinity && req.loop) {
                // Unbounded loop left running: open, runs to the project end.
                req.open = true;
            } else {
                // Bounded (stopped or finite-trimmed): never cross-scene. Clear any
                // stale open marker so assembleTimeline keeps the bounded end.
                req.open = false;
                req.mediaDuration = undefined;
            }
            tracker.addAudioRequest(req);
        }
    }

    dispose(): void {
        this._requests.length = 0;
        this._activeId = null;
        this._currentTime = 0;
    }
}
