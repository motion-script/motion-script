import { BorderRadiusProps } from "@/attributes/shape/corners/border-radius";
import { ShapeState } from "./shape";


export interface RectState extends ShapeState {
    width: number;
    height: number;
    borderRadius: BorderRadiusProps;
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
        effects: descriptor.effects ?? [],
        pivot: descriptor.pivot ?? { x: 0, y: 0 },

        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        borderRadius: descriptor.borderRadius ?? 0,
    };
}









