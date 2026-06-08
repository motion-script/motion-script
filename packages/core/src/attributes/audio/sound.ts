import { FrameGenerator } from "@/tween/generator";
import { wait } from "@/tween/wait";
import { AssetTracker } from "@/assets/tracker";
import { AudioRequest } from "@/attributes/audio/request";

interface SoundPropsBase {
    src: string;
    volume?: number;
    loop?: boolean;
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
}

/**
 * A playable audio clip. Deliberately *not* a {@link Node} — audio lives on a
 * parallel timeline, not in the visual scene graph.
 *
 * Wire it up by calling {@link tick} from your node or scene's tick(), then call
 * {@link prepare} from prepare() to register requests with the asset tracker.
 * Use {@link start}/{@link stop} imperatively or {@link play} in a generator.
 */
export class Sound {
    readonly src: string;
    volume: number;
    loop: boolean;
    trimStart: number;
    trimEnd: number;

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
    }

    /** Update the sound's current time. Call from your node's tick(time). */
    tick(time: number): void {
        this._currentTime = time;
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
        const endAt = this.trimEnd !== Infinity
            ? startAt + Math.max(0, this.trimEnd - this.trimStart)
            : Infinity;
        this._requests.push({
            id,
            src: this.src,
            startAt,
            endAt,
            volume: this.volume,
            loop: this.loop,
            trimStart: this.trimStart,
        });
        this._activeId = id;
    }

    /** Stop playback. No-op if not playing. */
    stop(): void {
        if (this._activeId === null) return;
        const req = this._requests.find(r => r.id === this._activeId);
        if (req) req.endAt = this._currentTime;
        this._activeId = null;
    }

    /**
     * Generator form: start, yield for the clip's duration, then stop.
     * Pass `duration` to override — required for looping clips unless `trimEnd`
     * is set (the catalog-resolved full length counts as set).
     */
    *play(duration?: number): FrameGenerator {
        this.start();
        const d = duration
            ?? (this.trimEnd !== Infinity ? this.trimEnd - this.trimStart : undefined);
        if (d !== undefined && d > 0) yield* wait(d);
        this.stop();
    }

    /**
     * Register this sound's requests with the asset tracker. Call from your node's
     * prepare(tracker). Handles file-load registration and pushes new playback
     * requests — safe to call every frame (deduplicated internally).
     */
    prepare(tracker: AssetTracker): void {
        tracker.requestAudio(this.src);
        for (const req of this._requests) {
            if (req.endAt === Infinity && !req.loop) {
                req.endAt = req.startAt + Math.max(0,
                    (this.trimEnd !== Infinity
                        ? this.trimEnd
                        : tracker.catalog.getAudioDuration(this.src)
                    ) - this.trimStart,
                );
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
