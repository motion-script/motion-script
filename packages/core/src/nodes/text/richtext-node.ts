import { TextAlign } from "@/attributes/text/align";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { resolveFillArray } from "@/attributes/shape/fill/registry";
import { FillResolved } from "@/attributes/shape/fill/union";
import { resolveStrokeArray, StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { Size2D } from "@/attributes/layout/size";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { ContextMap } from "@/util/context";
import { FontStyle, ResolvedTextSpan, TextSpan } from "@/attributes/text/span";
import { applyTextDefaults } from "@/runtime/builtin-context";


export interface RichTextProps extends ShapeProps {
    spans: TextSpan | TextSpan[];
    /** Default font family inherited by spans that don't set one. */
    fontFamily: string;
    /** Default font size inherited by spans that don't set one. */
    fontSize: number;
    /** Default font weight inherited by spans that don't set one. */
    fontWeight: number;
    /** Default font style inherited by spans that don't set one. */
    fontStyle: FontStyle;
    /** Default letter spacing inherited by spans that don't set one. */
    letterSpacing: number;
    /** Line height multiplier applied to each run's font size. */
    lineHeight: number;
    textAlign: TextAlign;
    /**
     * Name of a typography preset from `theme.typography` (e.g. `"body"`).
     * Supplies any node-level default (fontSize, fontWeight, …) not set
     * explicitly here, which `runs()` then folds into each span. An explicit prop
     * wins over the preset; the preset wins over an inherited `<DefaultTextStyle>`.
     */
    variant: string;
}

export class RichText extends ShapeNode<RichTextProps> {



    @property({
        default: [],
        mapper: (v: TextSpan | TextSpan[] | undefined): TextSpan[] =>
            v == null ? [] : Array.isArray(v) ? v : [v],
    }) declare readonly spans: TextSpan[];
    @property({ default: "Inter" }) declare readonly fontFamily: string;
    @property({ default: 16 }) declare readonly fontSize: number;
    @property({ default: 400 }) declare readonly fontWeight: number;
    @property({ default: 'normal' }) declare readonly fontStyle: FontStyle;
    @property({ default: 0 }) declare readonly letterSpacing: number;
    @property({ default: 1.2 }) declare readonly lineHeight: number;
    @property({ default: 'center' }) declare readonly textAlign: TextAlign;
    @property({ default: undefined }) declare readonly variant?: string;

    constructor(props: NodeConfig<RichText, RichTextProps>) {
        super(props);
    }

    // Inherit text-style defaults from the nearest ancestor <DefaultTextStyle> for
    // any default the author didn't set; these node-level defaults are then folded
    // into each span. Context-value application (spans are fixed structure), so it
    // lives in resolveContext — runs once after the tree + context exist. See Text.
    protected override resolveContext(_ctx: ContextMap): void {
        applyTextDefaults(this, this._props as Record<string, unknown> | undefined);
    }

    // RichText always sizes to its own laid-out spans — it has no children
    // to hug — so it ignores the base has-children default and always hugs.
    protected override applyDefaultSize(props?: NodeConfig<RichText, RichTextProps>): void {
        this.applyProp("height", props?.height ?? "hug");
        this.applyProp("width", props?.width ?? "hug");
    }

    /**
     * Flatten the nested span tree against this node's defaults, returning
     * leaf runs in document order. Children inherit any style fields the
     * parent set; explicit fields on a child override them.
     */
    runs(): ResolvedTextSpan[] {
        const out: ResolvedTextSpan[] = [];
        const base = {
            fontFamily: this.fontFamily,
            fontSize: this.fontSize,
            fontWeight: this.fontWeight,
            fontStyle: this.fontStyle,
            letterSpacing: this.letterSpacing,
            fill: this.fill as FillResolved[],
            stroke: this.stroke as StrokeResolved[],
        };
        const walk = (span: TextSpan, inherited: typeof base) => {
            const merged = {
                fontFamily: span.fontFamily ?? inherited.fontFamily,
                fontSize: span.fontSize ?? inherited.fontSize,
                fontWeight: span.fontWeight ?? inherited.fontWeight,
                fontStyle: span.fontStyle ?? inherited.fontStyle,
                letterSpacing: span.letterSpacing ?? inherited.letterSpacing,
                fill: span.fill != null ? resolveFillArray(span.fill) : inherited.fill,
                stroke: span.stroke != null ? resolveStrokeArray(span.stroke) : inherited.stroke,
            };
            if (span.text) {
                out.push({
                    text: span.text,
                    fontFamily: merged.fontFamily,
                    fontSize: merged.fontSize,
                    fontWeight: merged.fontWeight,
                    fontStyle: merged.fontStyle,
                    letterSpacing: merged.letterSpacing,
                    fill: merged.fill,
                    stroke: merged.stroke,
                });
            }
            if (span.children) {
                for (const child of span.children) walk(child, merged);
            }
        };
        for (const span of this.spans) walk(span, base);
        return out;
    }

    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const runs = this.runs();
        let lineW = 0;
        let maxLineH = 0;
        let totalW = 0;
        let totalH = 0;

        const finishLine = () => {
            if (lineW > totalW) totalW = lineW;
            totalH += maxLineH;
            lineW = 0;
            maxLineH = 0;
        };

        for (const run of runs) {
            const lh = run.fontSize * this.lineHeight;
            const segments = run.text.split("\n");
            for (let i = 0; i < segments.length; i++) {
                if (i > 0) finishLine();
                // Called unconditionally (even for an empty segment, where
                // measureTextCached short-circuits to 0) so TrackMeasureScope
                // always sees this run's font, not just on frames with content.
                lineW += scope.measureText(segments[i], run.fontSize, run.fontFamily, run.fontWeight, run.letterSpacing, run.fontStyle);
                if (lh > maxLineH) maxLineH = lh;
            }
        }
        finishLine();

        if (totalH === 0) totalH = this.fontSize * this.lineHeight;

        const wm = this.width;
        const hm = this.height;

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? totalW
                : constraints.maxWidth ?? 0;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? totalH
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    protected override renderSelf(ctx: RenderContext): void {
        ctx.draw(new Graphics().richText({
            spans: this.runs(),
            lineHeight: this.lineHeight,
            textAlign: this.textAlign,
            width: this.layoutRect?.width ?? 0,
            height: this.layoutRect?.height ?? 0,
        }));
    }
}
