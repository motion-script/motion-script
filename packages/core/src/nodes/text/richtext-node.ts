import { TextAlign } from "@/attributes/text/align";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Measurer } from "@/render/measurer";
import { prepareFill, resolveFillArray } from "@/attributes/shape/fill/registry";
import { FillResolved } from "@/attributes/shape/fill/union";
import { AssetTracker } from "@/assets/tracker";
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
     * Supplies any node-level default (fontSize, fontWeight, â€¦) not set
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
    /**
     * The family this text is set in. **No default** — it comes from the cascade
     * in `applyTextDefaults`: what the author passed, else a `variant` preset,
     * else the nearest enclosing `<DefaultTextStyle>`, else the theme's `default`
     * typography preset.
     *
     * A literal default here would sit *under* all four and quietly win whenever
     * every one of them was silent, which is precisely the case worth hearing
     * about: text set in a face nobody chose is text whose font was never
     * declared and so never loaded. Left unset, the renderer says so instead —
     * see `requireFontFamily`.
     */
    @property() declare readonly fontFamily: string;
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
    // lives in resolveContext â€” runs once after the tree + context exist. See Text.
    protected override resolveContext(_ctx: ContextMap): void {
        applyTextDefaults(this, this._props as Record<string, unknown> | undefined);
    }

    // RichText always sizes to its own laid-out spans â€” it has no children
    // to hug â€” so it ignores the base has-children default and always hugs.
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

    /**
     * Every family the flattened runs resolve to â€” not just this node's default.
     *
     * A span can name its own `fontFamily`, so declaring `this.fontFamily` alone
     * would leave a styled run shaping against the fallback face. {@link runs}
     * is the same flattening {@link measure} and the render both use, which is
     * what keeps the declaration and the draw from naming different families.
     */
    override prepareLayout(tracker: AssetTracker): void {
        for (const run of this.runs()) tracker.addFont(run.fontFamily, run.fontWeight);
    }

    /** Per-run paint, for the same reason: a span may carry a fill this node doesn't. */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const rect = this.layoutRect;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        for (const run of this.runs()) {
            for (const fill of run.fill) prepareFill(fill, tracker, width, height);
            for (const stroke of run.stroke) {
                for (const fill of stroke.fill) prepareFill(fill, tracker, width, height);
            }
        }
    }

    measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
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
                // measureTextCached short-circuits to 0) so an empty run still
                // contributes its line height.
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
