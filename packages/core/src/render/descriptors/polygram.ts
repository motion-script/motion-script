import { ShapeState } from "./shape";

export interface PolygramState extends ShapeState {
    width: number;
    height: number;
    sides: number;
    ratio: number;
    borderRadius: number;
}

export function withPolygramDescriptor(descriptor: Partial<PolygramState>): PolygramState {
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
        ratio: descriptor.ratio ?? 0.5,
        borderRadius: descriptor.borderRadius ?? 0,
    };
}
