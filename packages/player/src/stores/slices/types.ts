import type { StateCreator } from "zustand";

import type { EditorState } from "../editor-store";

/**
 * The store is split into slices (standard zustand pattern). Each slice is a
 * `StateCreator` typed against the *full* {@link EditorState} so slices can read
 * one another through the shared `get()` (e.g. playback reads `fps`/`duration`),
 * while only contributing its own keys. `SliceCreator<T>` is the type a slice
 * factory returns; `EditorState` is the union of every slice's `T`.
 */
export type SliceCreator<T> = StateCreator<EditorState, [], [], T>;
