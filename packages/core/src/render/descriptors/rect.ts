import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeAnchorInput, ShapeState, resolveShapeAnchor, resolveShapePivot, stripShapeAnchorKeys } from "./shape";


export interface RectState extends ShapeState {
    width: number;
    height: number;
    // Accepts loose input or an already-resolved value (both are part of
    // RectCornerRadius/RectCornerStyle): the node resolves via its @property
    // mapper, and the renderer re-resolves idempotently.
    cornerRadius: RectCornerRadius;
    cornerStyle: RectCornerStyle;
}

export function withRectDescriptor(descriptor: Partial<RectState> & ShapeAnchorInput): RectState {
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
        cornerRadius: descriptor.cornerRadius ?? 0,
        cornerStyle: descriptor.cornerStyle ?? "rounded",
    };
}
