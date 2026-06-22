import type { NodeState, TreeState } from "@motion-script/core";

import type { SliceCreator } from "./types";

export type BuildError = {
    sceneName: string;
    sceneIndex: number;
    message: string;
    stack?: string;
};

/**
 * Editor chrome state that isn't playback or geometry: loading/snapshot/export
 * status, build errors surfaced from the dev server, and the inspected node
 * tree / selection.
 */
export type UiSlice = {
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;

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
};

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
    isLoading: false,
    setIsLoading: (loading) => set(() => ({ isLoading: loading })),

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
});
