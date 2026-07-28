import type { WaveformInfo } from "@motion-script/core";

import type { SliceCreator } from "./types";

/**
 * Timeline measurements and zoom. `setSceneDurations` derives per-scene start
 * frames and, on a project reload, completes the pending scene jump stashed by
 * the project slice's `resetConfig` (reads `_pendingSceneIndex` and `fps`).
 */
/**
 * How much of the project the background precomp has measured.
 *
 * Only the scene owning frame 0 is measured before the player mounts, so on a
 * long project `duration` and `sceneStartFrames` describe a prefix of the
 * timeline and grow as scenes land. Anything presenting the timeline as final
 * should check `complete` first.
 */
export type PrecompProgressState = {
    measuredScenes: number;
    totalScenes: number;
    complete: boolean;
};

export type TimelineSlice = {
    duration: number;
    setDuration: (duration: number) => void;

    precompProgress: PrecompProgressState;
    setPrecompProgress: (progress: PrecompProgressState) => void;

    sceneStartFrames: number[];
    setSceneDurations: (durationFrames: number[]) => void;

    /**
     * The project's audio beds resolved to absolute timeline clips, for the
     * timeline's global track rows. Derived from the live controller rather than
     * from `audioTracks` directly: a bed's end depends on the source's length and
     * on the measured duration, neither of which the config states.
     */
    globalAudioClips: WaveformInfo[];
    setGlobalAudioClips: (clips: WaveformInfo[]) => void;

    timelineZoom: number;
    setTimelineZoom: (zoom: number) => void;
    zoomTimelineBy: (delta: number, opts?: { min?: number; max?: number }) => void;
};

export const createTimelineSlice: SliceCreator<TimelineSlice> = (set, get) => ({
    duration: 0,
    setDuration: (duration) => set(() => ({ duration })),

    // Starts complete so nothing flashes before the player mounts and reports;
    // MotionPlayer publishes the real starting position on mount.
    precompProgress: { measuredScenes: 0, totalScenes: 0, complete: true },
    setPrecompProgress: (precompProgress) => set(() => ({ precompProgress })),

    globalAudioClips: [],
    setGlobalAudioClips: (globalAudioClips) => set(() => ({ globalAudioClips })),

    sceneStartFrames: [],
    setSceneDurations: (durationFrames) => {
        const starts: number[] = [];
        let acc = 0;
        for (const d of durationFrames) {
            starts.push(acc);
            acc += d;
        }
        const { _pendingSceneIndex, fps } = get();
        if (_pendingSceneIndex !== null) {
            const targetIndex = Math.min(_pendingSceneIndex, starts.length - 1);
            const targetFrame = starts[targetIndex] ?? 0;
            set(() => ({
                sceneStartFrames: starts,
                currentFrame: targetFrame,
                currentTime: targetFrame / fps,
                _pendingSceneIndex: null,
            }));
        } else {
            set(() => ({ sceneStartFrames: starts }));
        }
    },

    timelineZoom: 1,
    setTimelineZoom: (zoom) => set(() => ({ timelineZoom: Math.max(0.01, zoom) })),
    zoomTimelineBy: (delta, opts) => {
        const { min = 0.01, max = 10 } = opts ?? {};
        set((s) => ({
            timelineZoom: Math.max(min, Math.min(max, s.timelineZoom + delta)),
        }));
    },
});
