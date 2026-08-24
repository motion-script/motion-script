import { nodePath } from "@/project/tree";
import type { AssetTracker } from "@/assets/tracker";
import type { Node } from "./node";

/**
 * The subtree traversals the runtime drives, as free functions over a {@link Node}.
 *
 * **Not methods, deliberately.** Each one is a pure walk — visit a node, call one
 * per-node hook on it, recurse — and none of them belongs to a node any more than
 * a `for` loop belongs to an array. Keeping them here does two things a method
 * could not:
 *
 * - It keeps them out of a node's autocomplete. `prepareRenderAssets` sat one
 *   letter from `prepareRender` on every node in the tree, and the two are not
 *   interchangeable: one is the hook a custom node overrides, the other is the
 *   walk that calls it. Naming the walk `declareRenderAssets` and moving it here
 *   removes the collision rather than documenting it.
 * - It makes the split visible. What is left on `Node` is what a node *is*; what
 *   is here is what the engine *does to* one, once per frame.
 *
 * Every walk stops at an unmounted node — see {@link Node.mounted}.
 *
 * @internal
 */

/**
 * Collect every node's **pre-layout** asset declarations (see
 * {@link Node.prepareLayout}).
 *
 * Runs ahead of layout, so a node cannot size a declaration to its box here;
 * that is what {@link declareRenderAssets} is for.
 */
export function declareLayoutAssets(node: Node, tracker: AssetTracker): void {
    if (!node.mounted) return;
    node.prepareLayout(tracker);
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        declareLayoutAssets(children[i], tracker);
    }
}

/**
 * Collect every node's **pre-render** asset declarations (see
 * {@link Node.prepareRender}).
 *
 * Stamps the owning node's structural path while each node declares, so an audio
 * request lands on its own timeline bar — purely for display, playback ignores
 * `ownerPath`. That stamping used to live on a third `prepareAudio` walk; audio
 * needs no layout, so a `Video` declaring its picture and its sound in one place
 * is both simpler and one fewer tree walk per frame.
 */
export function declareRenderAssets(node: Node, tracker: AssetTracker, path = ""): void {
    if (!node.mounted) return;
    tracker.withOwnerPath(path, () => node.prepareRender(tracker));
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        declareRenderAssets(children[i], tracker, nodePath(path, i));
    }
}

/**
 * Sample every node's derived render state (currently motion) for this frame.
 *
 * Normally done by `attach` as it advances the clock; this is the seam for the
 * priming path, which needs the same state seeded without moving time (see
 * `StateEvaluator.resetSlot`).
 */
export function sampleTree(node: Node): void {
    node._sample();
    for (const child of node.children) sampleTree(child);
}

/**
 * Record the subtree's current positions as the motion history's previous frame,
 * stamped `at`, deriving no velocity.
 *
 * The driven path calls this with the props evaluated one frame back, so the
 * {@link sampleTree} that follows measures against the timeline rather than
 * against wherever the playhead happened to be.
 */
export function primeMotionTree(node: Node, at: number): void {
    node._primeMotion(at);
    for (const child of node.children) primeMotionTree(child, at);
}
