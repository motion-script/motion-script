import { TextAlign } from "@/attributes/text/align";
import { ResolvedTextSpan } from "@/attributes/text/span";
import { ShapeState } from "./shape";

export interface RichTextState extends ShapeState {
    spans: ResolvedTextSpan[];
    lineHeight: number;
    align: TextAlign;
    width: number;
    height: number;
}

export function withRichTextDescriptor(descriptor: Partial<RichTextState>): RichTextState {
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
        spans: descriptor.spans ?? [],
        lineHeight: descriptor.lineHeight ?? 1.2,
        align: descriptor.align ?? 'center',
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
    };
}
