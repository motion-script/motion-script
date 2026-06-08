import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { ShapeState } from "./shape";

export interface TextState extends ShapeState {
    text: string;
    fontSize: number | 'autofit';
    fontFamily: string;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    lineHeight: number;
    align: TextAlign;
    wrap: boolean;
    minFontSize: number;
    width: number;
    height: number;
}


export function withTextDescriptor(descriptor: Partial<TextState>): TextState {
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
        text: descriptor.text ?? "",
        fontSize: descriptor.fontSize ?? 16,
        fontFamily: descriptor.fontFamily ?? "Arial",
        fontWeight: descriptor.fontWeight ?? 400,
        fontStyle: descriptor.fontStyle ?? 'normal',
        letterSpacing: descriptor.letterSpacing ?? 0,
        lineHeight: descriptor.lineHeight ?? 0,
        align: descriptor.align ?? 'center',
        wrap: descriptor.wrap ?? false,
        minFontSize: descriptor.minFontSize ?? 12,
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
    };
}