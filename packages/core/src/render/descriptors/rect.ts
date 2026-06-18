import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeState } from "./shape";


export interface RectState extends ShapeState {
    width: number;
    height: number;
    // Accepts loose input or an already-resolved value (both are part of
    // RectCornerRadius/RectCornerStyle): the node resolves via its @property
    // mapper, and the renderer re-resolves idempotently.
    cornerRadius: RectCornerRadius;
    cornerStyle: RectCornerStyle;
}

export function withRectDescriptor(descriptor: Partial<RectState>): RectState {
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
        cornerRadius: descriptor.cornerRadius ?? 0,
        cornerStyle: descriptor.cornerStyle ?? "rounded",
    };
}
