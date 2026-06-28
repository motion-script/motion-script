import { ShapeAnchorInput, ShapeState, resolveShapeAnchor, resolveShapePivot, stripShapeAnchorKeys } from "./shape";
export interface EllipseState extends ShapeState {
    width: number;
    height: number;
    ratio: number;
    sweep: number;
    startAngle: number;
}

export function withEllipseDescriptor(descriptor: Partial<EllipseState> & ShapeAnchorInput): EllipseState {
    const width = descriptor.width ?? 0;
    const height = descriptor.height ?? 0;
    const { x, y, pivot } = resolveShapeAnchor(descriptor, width, height);
    return {
        ...stripShapeAnchorKeys(descriptor),
        opacity: descriptor.opacity ?? 1,
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x,
        y,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        pivot: resolveShapePivot(pivot),

        width,
        height,
        ratio: descriptor.ratio ?? 1,
        sweep: descriptor.sweep ?? 360,
        startAngle: descriptor.startAngle ?? 0,
    };
}