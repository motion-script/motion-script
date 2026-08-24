/**
 * A node's place on the scene's clock, read via `node.time`.
 *
 * Advanced once per frame by `Node.attach`, and consumed by motion sampling,
 * the render context's `elapsed`, and anything a node's own `tick()` derives
 * from time.
 *
 * `creation` is seeded on the node's **first** advance rather than at
 * construction, so `elapsed` measures how long a node has been *in the scene* —
 * which is what an entrance animation, a video's playhead and a per-node
 * dissolve all actually mean. A node built during the generator's third second
 * and added then reads `elapsed === 0` on its first frame.
 */
export interface NodeTime {
    /** Seconds since the scene started. */
    readonly total: number;
    /** The scene time at which this node was first advanced. */
    readonly creation: number;
    /** How long this node has existed: `total - creation`. */
    readonly elapsed: number;
}

/**
 * The writable form the runtime advances. Nodes hand out {@link NodeTime}, which
 * is the same shape with every field read-only.
 *
 * @internal
 */
export interface MutableNodeTime {
    total: number;
    creation: number;
    elapsed: number;
    /** Whether {@link advanceNodeTime} has seeded `creation` yet. */
    started: boolean;
}

/** The zeroed holder a node keeps for its lifetime. @internal */
export function createNodeTime(): MutableNodeTime {
    return { total: 0, creation: 0, elapsed: 0, started: false };
}

/** Advance `time` to `total` scene-seconds, seeding `creation` on first tick. @internal */
export function advanceNodeTime(time: MutableNodeTime, total: number): void {
    if (!time.started) {
        time.creation = total;
        time.started = true;
    }
    time.total = total;
    time.elapsed = total - time.creation;
}
