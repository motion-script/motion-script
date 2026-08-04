import type { NodeState, TreeState } from "@motion-script/core";

import type { SliceCreator } from "./types";

export type BuildError = {
    sceneName: string;
    sceneIndex: number;
    message: string;
    stack?: string;
};

/**
 * Editor chrome state that isn't playback or geometry: seek/snapshot/export
 * status, build errors surfaced from the dev server, and the inspected node
 * tree / selection.
 */
export type UiSlice = {
    /**
     * True while a seek is in flight (mount, scrub, or scene hot-swap). Goes
     * true on every seek and false when it settles, so consumers that render
     * from it must add their own hysteresis — see `useDelayedFlag`.
     */
    isSeeking: boolean;
    setIsSeeking: (seeking: boolean) => void;

    snapshotRequested: boolean;
    requestSnapshot: () => void;
    completeSnapshot: () => void;

    exportProgress: number | null;
    setExportProgress: (progress: number | null) => void;

    buildErrors: BuildError[];
    setBuildErrors: (errors: BuildError[]) => void;

    rootNode: TreeState | null;
    setRootNode: (node: TreeState | null) => void;

    selectedNode: NodeState | null;
    setSelectedNode: (node: NodeState | null) => void;

    isFullscreen: boolean;
    setIsFullscreen: (fullscreen: boolean) => void;
    toggleFullscreen: () => void;

    /**
     * Strips the editor down to the preview and a minimal transport: no scene
     * panel, no timeline, no node tree, no preview rulers, and — the expensive
     * one — no per-frame `getTreeState` walk (see VideoPreview).
     *
     * A diagnostic rather than a viewing mode: the preview canvas is identical
     * either way, so if playback is smooth here and stutters in the full editor,
     * the cost is the player's React work, not the engine's. Toggling it leaves
     * the mounted player untouched (see EditorLayout), so the comparison can be
     * made mid-playback.
     */
    simplePlayer: boolean;
    setSimplePlayer: (simple: boolean) => void;
    toggleSimplePlayer: () => void;
};

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
    isSeeking: false,
    setIsSeeking: (seeking) => set(() => ({ isSeeking: seeking })),

    snapshotRequested: false,
    requestSnapshot: () => set(() => ({ snapshotRequested: true })),
    completeSnapshot: () => set(() => ({ snapshotRequested: false })),

    exportProgress: null,
    setExportProgress: (progress) => set(() => ({ exportProgress: progress })),

    buildErrors: [],
    setBuildErrors: (errors) => set(() => ({ buildErrors: errors })),

    rootNode: null,
    setRootNode: (node) => set(() => ({ rootNode: node })),

    selectedNode: null,
    setSelectedNode: (node) => set(() => ({ selectedNode: node })),

    isFullscreen: false,
    setIsFullscreen: (fullscreen) => set(() => ({ isFullscreen: fullscreen })),
    toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

    simplePlayer: false,
    setSimplePlayer: (simple) => set(() => ({ simplePlayer: simple })),
    toggleSimplePlayer: () => set((s) => ({ simplePlayer: !s.simplePlayer })),
});
