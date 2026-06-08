import { SceneEffect } from "@/attributes/shape/effects/union";
import { Vector2 } from "@/attributes/layout/vector2";

export interface TransformState {
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
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
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        effects: descriptor.effects ?? [],
        pivot: descriptor.pivot ?? { x: 0, y: 0 },
    };
}