import type { SliceCreator } from "./types";

/**
 * Timeline measurements and zoom. `setSceneDurations` derives per-scene start
 * frames and, on a project reload, completes the pending scene jump stashed by
 * the project slice's `resetConfig` (reads `_pendingSceneIndex` and `fps`).
 */
export type TimelineSlice = {
    duration: number;
    setDuration: (duration: number) => void;

    sceneStartFrames: number[];
    setSceneDurations: (durationFrames: number[]) => void;

    timelineZoom: number;
    setTimelineZoom: (zoom: number) => void;
    zoomTimelineBy: (delta: number, opts?: { min?: number; max?: number }) => void;
};

export const createTimelineSlice: SliceCreator<TimelineSlice> = (set, get) => ({
    duration: 0,
    setDuration: (duration) => set(() => ({ duration })),

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
