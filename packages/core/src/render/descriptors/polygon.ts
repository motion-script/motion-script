import { ShapeState } from "./shape";

export interface PolygonState extends ShapeState {
    width: number;
    height: number;
    sides: number;
    borderRadius: number;
}

export function withPolygonDescriptor(descriptor: Partial<PolygonState>): PolygonState {
    return {
        ...descriptor,
        opacity: descriptor.opacity ?? 1,
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        effects: descriptor.effects ?? [],
        pivot: descriptor.pivot ?? { x: 0, y: 0 },

        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        sides: descriptor.sides ?? 5,
        borderRadius: descriptor.borderRadius ?? 0,
    };
}
