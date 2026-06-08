export interface AudioParams {
    src: string;
    volume?: number;
    loop?: boolean;
    trimStart?: number; // in seconds
    trimEnd?: number; // in seconds
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
}