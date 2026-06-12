import { lerpText } from "@/attributes/text/lerp";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { Size2D } from "@/attributes/layout/size";
import { EaseFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";


export interface TextProps extends ShapeProps {
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
}


export class Text extends ShapeNode<TextProps> {



    @property({ default: "", tween: lerpText }) declare readonly text: string;
    @property({ default: "Inter" }) declare readonly fontFamily: string;
    @property({ default: 16 }) declare readonly fontSize: number | 'autofit';
    @property({ default: 400 }) declare readonly fontWeight: number;
    @property({ default: 'normal' }) declare readonly fontStyle: FontStyle;
    @property({ default: 0 }) declare readonly letterSpacing: number;
    @property({ default: 1.2 }) declare readonly lineHeight: number;
    @property({ default: 'center' }) declare readonly align: TextAlign;
    @property({ default: false }) declare readonly wrap: boolean;
    @property({ default: 12 }) declare readonly minFontSize: number;

    constructor(props: NodeConfig<Text, TextProps>) {
        super(props);
        const autofit = props.fontSize === 'autofit';

        this.applyProp("height", props.height ?? (autofit || props.wrap ? "fill" : "hug"));
        this.applyProp("width", props.width ?? (autofit || props.wrap ? "fill" : "hug"));
    }

    prepare(storage: AssetTracker): void {
        storage.requestFont(this.fontFamily, this.fontWeight.toString());
    }

    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const measureFontSize = this.fontSize === 'autofit' ? 16 : this.fontSize;
        const paragraphs = this.text.split("\n");
        const lineH = measureFontSize * this.lineHeight;
        const intrinsicW = Math.max(...paragraphs.map(l => scope.measureText(l, measureFontSize, this.fontFamily, this.fontWeight, this.letterSpacing, this.fontStyle)));

        const wm = this.width;
        const hm = this.height;

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? intrinsicW
                : constraints.maxWidth ?? 0;

        // When wrap is on and the box has a finite width narrower than the text,
        // height needs to account for the extra lines produced by wrapping.
        const lineCount = this.wrap && resolvedW > 0
            ? paragraphs.reduce((n, p) => n + countWrappedLines(p, resolvedW, measureFontSize, this.fontFamily, this.fontWeight, scope, this.letterSpacing, this.fontStyle), 0)
            : paragraphs.length;
        const intrinsicH = lineCount * lineH;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? intrinsicH
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    *append(text: string, duration: number, easing?: EaseFunction): FrameGenerator {
        yield* this.to({ text: this.text + text }, duration, easing);
    }

    *prepend(text: string, duration: number, easing?: EaseFunction): FrameGenerator {
        yield* this.to({ text: text + this.text }, duration, easing);
    }

    protected override renderSelf(ctx: RenderContext): void {
        ctx.draw(new Graphics()
            .text({
                text: this.text,
                fontSize: this.fontSize,
                fontFamily: this.fontFamily,
                fontWeight: this.fontWeight,
                fontStyle: this.fontStyle,
                letterSpacing: this.letterSpacing,
                lineHeight: this.lineHeight,
                align: this.align,
                wrap: this.wrap,
                minFontSize: this.minFontSize,
                width: this.layoutRect?.width ?? 0,
                height: this.layoutRect?.height ?? 0,
            })
            .shadow(this.shadow)
            .fill(this.fill)
            .stroke(this.stroke));
    }
}

function countWrappedLines(
    paragraph: string,
    maxWidth: number,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
    scope: MeasureScope,
    letterSpacing: number = 0,
    fontStyle: FontStyle = 'normal',
): number {
    if (paragraph.length === 0) return 1;
    if (scope.measureText(paragraph, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle) <= maxWidth) return 1;

    const words = paragraph.split(/(\s+)/).filter(s => s.length > 0);
    let lines = 1;
    let lineW = 0;
    for (const word of words) {
        const w = scope.measureText(word, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle);
        if (lineW === 0) {
            lineW = w;
        } else if (lineW + w <= maxWidth) {
            lineW += w;
        } else {
            lines++;
            lineW = /^\s+$/.test(word) ? 0 : w;
        }
    }
    return lines;
}
