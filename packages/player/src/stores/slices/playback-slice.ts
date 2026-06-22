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
