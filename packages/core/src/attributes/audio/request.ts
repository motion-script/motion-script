import type { AudioFilterItem } from "@/attributes/audio/filters/union";

export interface AudioParams {
    src: string;
    volume?: number;
    loop?: boolean;
    trimStart?: number; // in seconds
    trimEnd?: number; // in seconds
    filters?: AudioFilterItem[];
}

export interface AudioRequest {
    id: string;
    /** The asset path or URL. ('src' is standard for media) */
    src: string;

    // --- Timeline Synchronization (Scene Time) ---

    /** The scene timestamp when the audio should START playing. */
    startAt: number; // in seconds

    /**
     * The scene timestamp when the audio should STOP playing.
     *
     * Always a number, and **`Infinity` is the open/unbounded sentinel** — never
     * `null` or `undefined`. A `startSound` left running carries `Infinity` until
     * {@link open} resolution pins it to the project end, and `Sound.playRanges`
     * is the one place it is projected to `null`, for display only.
     *
     * So test it with `Number.isFinite(endAt)`. A `?? Infinity` or `!== null`
     * guard is dead code that reads as if the field were nullable.
     */
    endAt: number; // in seconds

    /**
     * True when this request was started (`startSound`) and left running at its
     * scene's end — neither explicitly stopped nor finite-trimmed. Open requests
     * are exempt from the per-scene audio clamp and instead **continue across scene
     * boundaries**: `assembleTimeline` shifts them to absolute time and resolves
     * `endAt = min(startAt + mediaDuration, projectTotalDuration)` (a looped open
     * request runs to the project end). Bounded requests are unaffected.
     */
    open?: boolean;

    /**
     * Source media length in seconds, carried on **open** requests so the
     * cross-scene end can be resolved at assembly time without re-reading the
     * asset catalog. Ignored for bounded requests.
     */
    mediaDuration?: number;

    // --- Media Trimming (Local Audio Time) ---

    /** Offset in seconds to skip ahead in the audio file. Default: 0 */
    trimStart: number;

    // --- Playback Settings ---

    volume: number; // Default: 1.0
    loop: boolean;  // Default: false

    // --- Processing ---

    /** Audio filters applied in array order (index 0 closest to the source). */
    filters?: AudioFilterItem[];

    // --- Timeline attribution (display only) ---

    /**
     * Structural path (see `nodePath`) of the node that emitted this request,
     * stamped during the precomp prepare walk. Lets the timeline draw the clip's
     * waveform on its owning node's bar — a `Video`'s clip on the Video row, a
     * scene's `playSound` on the scene row. Undefined for requests added outside
     * a node walk; those fall back to the scene root. Never affects playback.
     */
    ownerPath?: string;
}