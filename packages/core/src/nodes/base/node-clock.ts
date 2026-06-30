/**
 * A node's timing state, advanced each frame by `Node.ellapse`. Read via
 * `node.clock`; consumed by motion sampling and the render context's `elapsed`.
 */
/** @internal */
export interface NodeClock {
    time: number;       // Absolute time since the scene started
    creation: number;   // The absolute time when this specific node was born
    elapsed: number;    // How long this node has existed (time - creation)
    initialized: boolean; // Whether the node has been initialized
}
