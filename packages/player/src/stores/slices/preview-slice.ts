import type { ProjectConfig, Size2D } from "@motion-script/core";

import type { SliceCreator } from "./types";

// "column": video preview above the timeline (default).
// "row": timeline on the left, video preview on the right — better for vertical videos.
export type PlayerLayout = "column" | "row";

// Vertical (portrait) videos are far easier to work on side-by-side: a tall
// preview leaves no room for a stacked timeline. Default such projects to the
// row layout; landscape/square keep the stacked column default.
const defaultLayoutForViewport = (viewport: Size2D): PlayerLayout =>
    viewport.height > viewport.width ? "row" : "column";

/**
 * Video-preview viewport: pan/zoom of the preview surface, the overall
 * player layout (stacked vs side-by-side), and the audio mute toggle.
 */
export type PreviewSlice = {
    playerLayout: PlayerLayout;
    setPlayerLayout: (layout: PlayerLayout) => void;
    togglePlayerLayout: () => void;

    previewZoom: number;
    previewPan: { x: number; y: number };
    setPreviewZoom: (zoom: number) => void;
    setPreviewPan: (pan: { x: number; y: number }) => void;
    resetPreviewView: () => void;

    isMuted: boolean;
    setIsMuted: (muted: boolean) => void;
    toggleMuted: () => void;
};

export const createPreviewSlice = (
    config: ProjectConfig,
): SliceCreator<PreviewSlice> => (set) => ({
    playerLayout: defaultLayoutForViewport(config.viewport),
    setPlayerLayout: (layout) => set(() => ({ playerLayout: layout })),
    togglePlayerLayout: () => set((s) => ({ playerLayout: s.playerLayout === "column" ? "row" : "column" })),

    previewZoom: 1,
    previewPan: { x: 0, y: 0 },
    setPreviewZoom: (zoom) =>
        set(() => ({ previewZoom: Math.max(0.1, Math.min(8, zoom)) })),
    setPreviewPan: (pan) => set(() => ({ previewPan: pan })),
    resetPreviewView: () =>
        set(() => ({ previewZoom: 1, previewPan: { x: 0, y: 0 } })),

    isMuted: false,
    setIsMuted: (muted) => set(() => ({ isMuted: muted })),
    toggleMuted: () => set((s) => ({ isMuted: !s.isMuted })),
});
