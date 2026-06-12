import { SceneEffect } from "@/attributes/shape/effects/union";
import { NodeBlendMode } from "@/attributes/shape/fill/blend";
import { Vector2 } from "@/attributes/layout/vector2";

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
    };
}