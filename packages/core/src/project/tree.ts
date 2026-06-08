/**
 * Structural key for a node within its scene: the child-index path from the
 * scene root, joined with ".". The root is "". Node ids are per-instance UUIDs
 * that change on every rebuild, so lifespan tracking keys on this instead — the
 * build is deterministic, so the same structural slot maps to the same path in
 * both the precomp pass and playback.
 */
export function nodePath(parentPath: string, childIndex: number): string {
    return parentPath === "" ? String(childIndex) : `${parentPath}.${childIndex}`;
}

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
export interface WaveformInfo {
    /** Fetchable audio source path / URL. */
    src: string;
    /** Display name for the clip (defaults to the file name of `src`). */
    name: string;
    /** Scene timestamp (seconds) when the clip starts. */
    startTime: number;
    /** Scene timestamp (seconds) when the clip ends, or null if open-ended. */
    endTime: number | null;
}

export interface TreeState {
    id: string;
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