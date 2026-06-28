import { TextAlign } from "@/attributes/text/align";
import { ResolvedTextSpan } from "@/attributes/text/span";
import { ShapeAnchorInput, ShapeState, resolveShapeAnchor, resolveShapePivot, stripShapeAnchorKeys } from "./shape";

export interface RichTextState extends ShapeState {
    spans: ResolvedTextSpan[];
    lineHeight: number;
    align: TextAlign;
    width: number;
    height: number;
}

export function withRichTextDescriptor(descriptor: Partial<RichTextState> & ShapeAnchorInput): RichTextState {
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
        spans: descriptor.spans ?? [],
        lineHeight: descriptor.lineHeight ?? 1.2,
        align: descriptor.align ?? 'center',
        width,
        height,
    };
}
