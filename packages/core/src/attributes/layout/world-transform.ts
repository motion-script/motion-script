import { Vector2 } from "./vector2";

/**
 * A node's resolved transform in global (world / scene-root) space. Unlike the
 * per-node `x`/`y` and anchor getters — which are relative to the node's parent
 * — every field here is folded through the full ancestor chain, so two nodes
 * under different parents can be compared or aligned directly.
 *
 * Positions use the same y-up convention as `x`/`y` (positive y is up). Read
 * inside a reactive callback (`x: () => other().global.topRight.x`) they track
 * changes to this node's *and* every ancestor's layout/transform.
 */
/** @internal */
export interface WorldTransform {
    /** World position of the node's center (its `x`/`y` origin). */
    readonly x: number;
    readonly y: number;
    readonly center: Vector2;
    readonly topLeft: Vector2;
    readonly topRight: Vector2;
    readonly bottomLeft: Vector2;
    readonly bottomRight: Vector2;
    readonly topCenter: Vector2;
    readonly bottomCenter: Vector2;
    readonly centerLeft: Vector2;
    readonly centerRight: Vector2;
    /** Sum of this node's and all ancestors' rotations, in degrees clockwise. */
    readonly rotation: number;
    /** Product of this node's and all ancestors' scale factors. */
    readonly scale: number;
    /**
     * Product of this node's and all ancestors' opacities, in `[0, 1]` — the
     * effective alpha the node renders at. Matches the renderer's pass-through
     * fold: an ancestor at half opacity halves everything beneath it.
     */
    readonly opacity: number;
}
