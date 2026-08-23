import { SceneEffect } from "@/attributes/shape/effects/union";
import { NodeBlendMode } from "@/attributes/shape/fill/blend";
import { Vector2 } from "@/attributes/layout/vector2";
import type { Matrix2D } from "@/attributes/layout/matrix2d";

export interface TransformState {
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    /** Layer blend mode. `'pass-through'` (the default) does not isolate the node; any other mode isolates it and blends its flattened result against the backdrop. Optional so per-shape descriptors that extend this state needn't carry it. */
    blend?: NodeBlendMode;
    rotation: number;
    scale: number;
    effects: SceneEffect[];
    /** Pivot point for rotation and scale, in normalised node space. (0,0)=center, (-1,1)=top-left, (1,-1)=bottom-right. */
    pivot: Vector2;
    /**
     * The node's whole local transform, precomposed — present only when the
     * decomposed fields above cannot express it, which today means a node that
     * mirrors or tilts out of its own plane (`flipHorizontal`, `rotationX`,
     * `perspective`, …). A backend that finds one **concats it instead of**
     * applying `x`/`y`/`rotation`/`scale`/`pivot`, not as well as.
     *
     * Handed over precomposed rather than as six more fields for each backend to
     * rebuild from: the projection is defined once, in `nodeProjectedMatrix`, and
     * every backend gets the same answer rather than each growing its own
     * arithmetic from the same inputs. It may carry a perspective row, so it is a
     * full 3×3 — see {@link Matrix2D}.
     *
     * Note this is deliberately *more* than `Node2D._localMatrix` reports: the
     * out-of-plane transform is paint rather than geometry, so it reaches the
     * canvas and nothing else. See `Node2D._localMatrix` for why.
     */
    matrix?: Matrix2D;
}


export function withTransformDescriptor(descriptor: Partial<TransformState>): TransformState {
    return {
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        opacity: descriptor.opacity ?? 1,
        blend: descriptor.blend ?? 'pass-through',
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        effects: descriptor.effects ?? [],
        pivot: descriptor.pivot ?? { x: 0, y: 0 },
        // No default: absent means "the decomposed fields say it all", which is
        // every node that stays in its own plane.
        matrix: descriptor.matrix,
    };
}