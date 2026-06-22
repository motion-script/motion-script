import { create } from "zustand";

import type { AssetManifest, ProjectConfig } from "@motion-script/core";

import { createPlaybackSlice, type PlaybackSlice } from "./slices/playback-slice";
import { createPreviewSlice, type PreviewSlice } from "./slices/preview-slice";
import { createProjectSlice, type ProjectSlice } from "./slices/project-slice";
import { createTimelineSlice, type TimelineSlice } from "./slices/timeline-slice";
import { createUiSlice, type UiSlice } from "./slices/ui-slice";

// Re-export slice-owned types so existing importers keep their `editor-store`
// import path (the store is the package-internal barrel for this state).
export type { LoopMode } from "./slices/playback-slice";
export type { PlayerLayout } from "./slices/preview-slice";
export type { BuildError } from "./slices/ui-slice";

const EMPTY_MANIFEST: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

// One store instance per loaded ProjectConfig (see editor-provider.tsx). On
// reload, `resetConfig` mutates this store in place rather than recreating it,
// so UI state (zoom, pan, playback) survives across project reloads. See
// ARCHITECTURE.md for the frame/time invariant and the pending-scene-index
// dance that keeps the active scene stable across reloads.
//
// The store is composed from independent slices (standard zustand pattern); see
// `./slices`. `EditorState` is the union of every slice, so consumers still see
// one flat state shape and select with `useEditorStore(s => s.foo)` as before.
export type EditorState =
    & ProjectSlice
    & PlaybackSlice
    & TimelineSlice
    & PreviewSlice
    & UiSlice;

export const createEditorStore = (config: ProjectConfig, assets: AssetManifest = EMPTY_MANIFEST) =>
    create<EditorState>()((...a) => ({
        ...createProjectSlice(config, assets)(...a),
        ...createPlaybackSlice(...a),
        ...createTimelineSlice(...a),
        ...createPreviewSlice(config)(...a),
        ...createUiSlice(...a),
    }));
