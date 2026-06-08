import { Vector2 } from "@/attributes/layout/vector2";
import { ShapeState } from "./shape";

export interface LineState extends ShapeState {
    points: Vector2[];
    radius: number;
    closed: boolean;
}

export function withLineDescriptor(descriptor: Partial<LineState>): LineState {
    return {
        opacity: descriptor.opacity ?? 1,
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        effects: descriptor.effects ?? [],
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        pivot: descriptor.pivot ?? { x: 0, y: 0 },

        points: descriptor.points ?? [],
        radius: descriptor.radius ?? 0,
        closed: descriptor.closed ?? false,
    };
}
