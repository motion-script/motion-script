/**
 * Structural key for a node within its scene: the child-index path from the
 * scene root, joined with ".". The root is "". Node2D ids are per-instance UUIDs
 * that change on every rebuild, so lifespan tracking keys on this instead — the
 * build is deterministic, so the same structural slot maps to the same path in
 * both the precomp pass and playback.
 */
/** @internal */
export function nodePath(parentPath: string, childIndex: number): string {
    return parentPath === "" ? String(childIndex) : `${parentPath}.${childIndex}`;
}

/** @internal */
export interface NodeState {
    id: string;
    type: string;
    /** Attribute overrides applied when this state is active. */
    properties: Record<string, any>;


}

/**
 * A single audio clip exposed by a node for timeline display. Times are in
 * scene seconds; `src` is the (fetchable) audio source path. Nodes that own
 * audio — e.g. a Scene with managed sounds — report one entry per play range.
 */
/** @internal */
export interface WaveformInfo {
    /** Fetchable audio source path / URL. */
    src: string;
    /** Scene timestamp (seconds) when the clip starts. */
    startTime: number;
    /** Scene timestamp (seconds) when the clip ends, or null if open-ended. */
    endTime: number | null;
}

export interface TreeState {
    /** Per-instance UUID. Changes on every rebuild — key on {@link path} instead. */
    id: string;
    /**
     * Structural path from the scene root (`""` for the root, `"0.2"` for the
     * third child of the first). Stable across rebuilds — unlike `id` — so a host
     * can key selection, expansion, and overrides on it. It is also what
     * `getNodeBox` / `setNodeOverride` accept.
     */
    path: string;
    type: string;
    meta?: Record<string, unknown>;
    /** Audio clips owned by this node, for waveform rendering in the timeline. */
    waveform?: WaveformInfo[];
    /**
     * Absolute timeline frame (across the whole video) at which this node first
     * appears. Undefined when its lifespan is unknown (e.g. no precomp data).
     */
    startFrame?: number;
    /**
     * Absolute timeline frame at which this node was last present. Together with
     * startFrame this bounds the node's track bar to its true lifespan.
     */
    endFrame?: number;
    children: TreeState[];
}