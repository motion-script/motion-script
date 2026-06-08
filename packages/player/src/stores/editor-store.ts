import { AssetManifest, Scene, Color, NodeState, TreeState, type ProjectConfig, type Size2D } from "@motion-script/core";

export type BuildError = {
    sceneName: string;
    sceneIndex: number;
    message: string;
    stack?: string;
};
import { create } from "zustand";

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

// One store instance per loaded ProjectConfig (see editor-provider.tsx). On
// reload, `resetConfig` mutates this store in place rather than recreating it,
// so UI state (zoom, pan, playback) survives across project reloads. See
// ARCHITECTURE.md for the frame/time invariant and the pending-scene-index
// dance that keeps the active scene stable across reloads.
export type EditorState = {
    scenes: Scene[];
    projectName: string;
    theme: Record<string, Color>;
    viewport: Size2D;
    fps: number;
    assets: AssetManifest;

    // Frame is the canonical integer position; currentTime is always frame/fps.
    currentFrame: number;
    currentTime: number;
    setCurrentFrame: (frame: number) => void;
    setCurrentTime: (time: number) => void; // snaps to nearest frame

    duration: number;
    setDuration: (duration: number) => void;

    sceneStartFrames: number[];
    setSceneDurations: (durationFrames: number[]) => void;

    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    togglePlay: () => void;

    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;

    snapshotRequested: boolean;
    requestSnapshot: () => void;
    completeSnapshot: () => void;

    exportProgress: number | null;
    setExportProgress: (progress: number | null) => void;

    timelineZoom: number;
    setTimelineZoom: (zoom: number) => void;
    zoomTimelineBy: (delta: number, opts?: { min?: number; max?: number }) => void;

    timelineCollapsed: boolean;
    setTimelineCollapsed: (collapsed: boolean) => void;
    toggleTimelineCollapsed: () => void;

    previewZoom: number;
    previewPan: { x: number; y: number };
    setPreviewZoom: (zoom: number) => void;
    setPreviewPan: (pan: { x: number; y: number }) => void;
    resetPreviewView: () => void;

    playbackSpeed: number;
    setPlaybackSpeed: (speed: number) => void;

    buildErrors: BuildError[];
    setBuildErrors: (errors: BuildError[]) => void;

    rootNode: TreeState | null;
    setRootNode: (node: TreeState | null) => void;

    selectedNode: NodeState | null;
    setSelectedNode: (node: NodeState | null) => void;

    isLooping: boolean;
    setIsLooping: (looping: boolean) => void;

    isMuted: boolean;
    setIsMuted: (muted: boolean) => void;
    toggleMuted: () => void;

    replay: () => void;
    resetConfig: (config: ProjectConfig) => void;

    _pendingSceneIndex: number | null;
};

export const createEditorStore = (config: ProjectConfig, assets: AssetManifest = EMPTY_MANIFEST) =>
    create<EditorState>((set, get) => ({
        scenes: config.scenes,
        projectName: config.name,
        viewport: config.viewport,
        fps: config.fps,
        theme: config.theme ?? {},
        assets,

        currentFrame: 0,
        currentTime: 0,
        _pendingSceneIndex: null,
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

        isLoading: false,
        setIsLoading: (loading) => set(() => ({ isLoading: loading })),

        snapshotRequested: false,
        requestSnapshot: () => set(() => ({ snapshotRequested: true })),
        completeSnapshot: () => set(() => ({ snapshotRequested: false })),

        exportProgress: null,
        setExportProgress: (progress) => set(() => ({ exportProgress: progress })),

        timelineZoom: 1,
        setTimelineZoom: (zoom) => set(() => ({ timelineZoom: Math.max(0.01, zoom) })),
        zoomTimelineBy: (delta, opts) => {
            const { min = 0.01, max = 10 } = opts ?? {};
            set((s) => ({
                timelineZoom: Math.max(min, Math.min(max, s.timelineZoom + delta)),
            }));
        },

        timelineCollapsed: false,
        setTimelineCollapsed: (collapsed) => set(() => ({ timelineCollapsed: collapsed })),
        toggleTimelineCollapsed: () => set((s) => ({ timelineCollapsed: !s.timelineCollapsed })),

        previewZoom: 1,
        previewPan: { x: 0, y: 0 },
        setPreviewZoom: (zoom) =>
            set(() => ({ previewZoom: Math.max(0.1, Math.min(8, zoom)) })),
        setPreviewPan: (pan) => set(() => ({ previewPan: pan })),
        resetPreviewView: () =>
            set(() => ({ previewZoom: 1, previewPan: { x: 0, y: 0 } })),

        playbackSpeed: 1,
        setPlaybackSpeed: (speed) => set(() => ({ playbackSpeed: speed })),

        buildErrors: [],
        setBuildErrors: (errors) => set(() => ({ buildErrors: errors })),

        rootNode: null,
        setRootNode: (node) => set(() => ({ rootNode: node })),

        selectedNode: null,
        setSelectedNode: (node) => set(() => ({ selectedNode: node })),

        isLooping: false,
        setIsLooping: (looping) => set(() => ({ isLooping: looping })),

        isMuted: false,
        setIsMuted: (muted) => set(() => ({ isMuted: muted })),
        toggleMuted: () => set((s) => ({ isMuted: !s.isMuted })),

        replay: () => {
            set(() => ({
                currentFrame: 0,
                currentTime: 0,
                isPlaying: true,
            }));
        },

        resetConfig: (newConfig) => {
            // Reloading a project must keep the user looking at "the same" scene even
            // though scene order/count/durations may have changed. We resolve the
            // scene by name (falling back to index) but can't compute its frame yet —
            // durations for the new config aren't known until the player re-renders —
            // so we stash `_pendingSceneIndex` and let `setSceneDurations` finish the
            // jump once real start frames exist.
            const { scenes, currentFrame, sceneStartFrames } = get();

            // Determine which scene was active before the reload
            const activeIndex = sceneStartFrames.length > 0
                ? sceneStartFrames.reduce((best, start, i) => currentFrame >= start ? i : best, 0)
                : 0;
            const activeName = scenes[activeIndex]?.name;

            // Try to find the same scene by name in the new config; fall back to same index
            const newScenes = newConfig.scenes;
            const newIndex = activeName
                ? (newScenes.findIndex(s => s.name === activeName) ?? -1) === -1
                    ? Math.min(activeIndex, newScenes.length - 1)
                    : newScenes.findIndex(s => s.name === activeName)
                : Math.min(activeIndex, newScenes.length - 1);

            // We don't know the new scene start frames yet (they're computed after render),
            // so store the target scene index and resolve it once durations are set.
            set(() => ({
                scenes: newConfig.scenes,
                projectName: newConfig.name,
                viewport: newConfig.viewport,
                fps: newConfig.fps,
                theme: newConfig.theme ?? {},
                currentFrame: 0,
                currentTime: 0,
                duration: 0,
                sceneStartFrames: [],
                isPlaying: false,
                buildErrors: [],
                _pendingSceneIndex: Math.max(0, newIndex),
            }));
        },
    }));
