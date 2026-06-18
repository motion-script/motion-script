import { ShapeState } from "./shape";
export interface EllipseState extends ShapeState {
    width: number;
    height: number;
    ratio: number;
    sweep: number;
    startAngle: number;
}

export function withEllipseDescriptor(descriptor: Partial<EllipseState>): EllipseState {
    return {
        ...descriptor,
        opacity: descriptor.opacity ?? 1,
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        pivot: descriptor.pivot ?? { x: 0, y: 0 },

        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        ratio: descriptor.ratio ?? 1,
        sweep: descriptor.sweep ?? 360,
        startAngle: descriptor.startAngle ?? 0,
    };
}