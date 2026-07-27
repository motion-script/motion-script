import type { SliceCreator } from "./types";

export type LoopMode = "off" | "scene" | "video";

/**
 * Playhead position and transport state. `currentFrame` is the canonical
 * integer position; `currentTime` is always `currentFrame / fps`. Reads `fps`
 * (project slice) and `duration` (timeline slice) through the shared `get()`.
 */
export type PlaybackSlice = {
    // Frame is the canonical integer position; currentTime is always frame/fps.
    currentFrame: number;
    currentTime: number;
    setCurrentFrame: (frame: number) => void;
    setCurrentTime: (time: number) => void; // snaps to nearest frame

    /** True while the ruler playhead is being dragged. */
    isScrubbing: boolean;
    /**
     * Visual-only playhead position during a drag; `null` when not scrubbing.
     *
     * Split from `currentFrame` on purpose. `currentFrame` drives the renderer,
     * and on a heavy project a seek can take far longer than a mouse move — if
     * the playhead were drawn from it, it would visibly lag the cursor. So the
     * drag writes here every animation frame (cheap, no seek) while committing
     * to `currentFrame` at whatever rate the engine can actually keep up with.
     */
    scrubFrame: number | null;
    /** Start a drag: pauses playback and pins the playhead to `frame`. */
    beginScrub: (frame: number) => void;
    /** Move the visual playhead only — deliberately does not seek. */
    updateScrub: (frame: number) => void;
    /** Finish a drag, committing `frame` as the real position. */
    endScrub: (frame: number) => void;

    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    togglePlay: () => void;

    playbackSpeed: number;
    setPlaybackSpeed: (speed: number) => void;

    loopMode: LoopMode;
    setLoopMode: (mode: LoopMode) => void;
    cycleLoopMode: () => void;

    replay: () => void;
};

export const createPlaybackSlice: SliceCreator<PlaybackSlice> = (set, get) => ({
    currentFrame: 0,
    currentTime: 0,
    setCurrentFrame: (frame) => {
        const { fps } = get();
        const f = Math.max(0, Math.round(frame));
        set(() => ({ currentFrame: f, currentTime: f / fps }));
    },
    setCurrentTime: (time) => {
        const { fps } = get();
        const f = Math.max(0, Math.round(time * fps));
        set(() => ({ currentFrame: f, currentTime: f / fps }));
    },

    isScrubbing: false,
    scrubFrame: null,
    beginScrub: (frame) => set(() => ({
        isScrubbing: true,
        scrubFrame: Math.max(0, Math.round(frame)),
        isPlaying: false,
    })),
    updateScrub: (frame) => set(() => ({ scrubFrame: Math.max(0, Math.round(frame)) })),
    endScrub: (frame) => set((s) => {
        const f = Math.max(0, Math.round(frame));
        // One atomic update: clearing `scrubFrame` and committing `currentFrame`
        // must land together. Split across two sets, the render between them
        // would draw the playhead from the *old* `currentFrame` — snapping it
        // backwards for a frame before the final seek catches up.
        return { isScrubbing: false, scrubFrame: null, currentFrame: f, currentTime: f / s.fps };
    }),

    isPlaying: false,
    setIsPlaying: (playing) => {
        if (!playing) {
            set(() => ({ isPlaying: false }));
        } else {
            const { currentFrame, duration, fps } = get();
            const totalFrames = Math.round(duration * fps);
            const frame = currentFrame >= totalFrames ? 0 : currentFrame;
            set(() => ({
                isPlaying: true,
                currentFrame: frame,
                currentTime: frame / fps,
                // You cannot be dragging the playhead and playing at once, so
                // starting playback always clears drag state. Without this, a
                // drag that never received its pointerup would leave the
                // playhead pinned to `scrubFrame` for the rest of the session.
                isScrubbing: false,
                scrubFrame: null,
            }));
        }
    },
    togglePlay: () => {
        const { isPlaying, setIsPlaying } = get();
        setIsPlaying(!isPlaying);
    },

    playbackSpeed: 1,
    setPlaybackSpeed: (speed) => set(() => ({ playbackSpeed: speed })),

    loopMode: "off",
    setLoopMode: (mode) => set(() => ({ loopMode: mode })),
    cycleLoopMode: () => set((s) => {
        const order: LoopMode[] = ["off", "scene", "video"];
        const next = order[(order.indexOf(s.loopMode) + 1) % order.length];
        return { loopMode: next };
    }),

    replay: () => {
        set(() => ({
            currentFrame: 0,
            currentTime: 0,
            isPlaying: true,
        }));
    },
});
