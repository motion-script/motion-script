import type { AudioFilter } from "@/attributes/audio/filters/union";

export interface AudioParams {
    src: string;
    volume?: number;
    loop?: boolean;
    trimStart?: number; // in seconds
    trimEnd?: number; // in seconds
    filters?: AudioFilter[];
}

export interface AudioRequest {
    id: string;
    /** The asset path or URL. ('src' is standard for media) */
    src: string;

    // --- Timeline Synchronization (Scene Time) ---

    /** The scene timestamp when the audio should START playing. */
    startAt: number; // in seconds

    /** The scene timestamp when the audio should STOP playing. (Optional) */
    endAt: number; // in seconds

    // --- Media Trimming (Local Audio Time) ---

    /** Offset in seconds to skip ahead in the audio file. Default: 0 */
    trimStart: number;

    // --- Playback Settings ---

    volume: number; // Default: 1.0
    loop: boolean;  // Default: false

    // --- Processing ---

    /** Audio filters applied in array order (index 0 closest to the source). */
    filters?: AudioFilter[];

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