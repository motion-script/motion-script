import { lerpText } from "@/attributes/text/lerp";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { ContextMap } from "@/util/context";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { Size2D } from "@/attributes/layout/size";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { TextSegment, TextState } from "@/render/descriptors/text";
import { FillResolved } from "@/attributes/shape/fill/union";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { PathData } from "@/render/descriptors/path";
import { PathBuilder } from "@/render/descriptors/path-builder";
import { measurePathData } from "@/attributes/shape/path/bounds";
import { TextRange, TextSelection } from "./text-selection";
import { applyTextDefaults } from "@/runtime/builtin-context";


export interface TextProps extends ShapeProps {
    text: string;
    fontSize: number | 'autofit';
    fontFamily: string;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    lineHeight: number;
    textAlign: TextAlign;
    wrap: boolean;
    minFontSize: number;
    /**
     * Name of a typography preset from `theme.typography` (e.g. `"header"`).
     * Supplies any text-style prop (fontSize, fontWeight, …) not set explicitly
     * here. An explicit prop always wins over the preset; the preset wins over an
     * inherited `<DefaultTextStyle>`.
     */
    variant: string;
    /**
     * Wrap the text around a path (text-on-path). Accepts the same value shapes
     * as the {@link Path} node's `d`: an SVG path string, a `PathCommand[]`, or a
     * {@link PathBuilder}. When set, `wrap` and multi-line (`\n`) are ignored
     * (single line), and text selections are not applied.
     */
    path: PathData | PathBuilder;
}

/** Coerce the loosely-typed `path` input into stored {@link PathData} (or null). */
function resolveTextPath(value: PathData | PathBuilder | null | undefined): PathData | null {
    if (value == null) return null;
    return value instanceof PathBuilder ? value.toCommands() : value;
}


export class Text extends ShapeNode<TextProps> {



    @property({ default: "", tween: lerpText }) declare readonly text: string;
    @property({ default: "Inter" }) declare readonly fontFamily: string;
    @property({ default: 16 }) declare readonly fontSize: number | 'autofit';
    @property({ default: 400 }) declare readonly fontWeight: number;
    @property({ default: 'normal' }) declare readonly fontStyle: FontStyle;
    @property({ default: 0 }) declare readonly letterSpacing: number;
    @property({ default: 1.2 }) declare readonly lineHeight: number;
    @property({ default: 'center' }) declare readonly textAlign: TextAlign;
    @property({ default: false }) declare readonly wrap: boolean;
    @property({ default: 12 }) declare readonly minFontSize: number;
    @property({ default: undefined }) declare readonly variant?: string;
    @property({ default: null, mapper: resolveTextPath })
    declare readonly path: PathData | null;

    constructor(props: NodeConfig<Text, TextProps>) {
        super(props);
    }

    // Inherit text-style defaults from the nearest ancestor <DefaultTextStyle>
    // for any style prop the author didn't set. This is context-value application
    // (structure is fixed — Text has no children), so it belongs in resolveContext,
    // which runs once after the tree + context exist. Writing through _writeProp
    // applies each field's own mapper (e.g. `fill`'s color resolver) once.
    protected override resolveContext(_ctx: ContextMap): void {
        applyTextDefaults(this, this._props as Record<string, unknown> | undefined);
    }

    // Text doesn't hug/fill based on children (it has none) — it hugs its own
    // glyph box by default, filling only when the box needs to be resolved
    // externally: `autofit` measures glyphs against the allotted box, and
    // `wrap` needs a width to wrap against.
    protected override applyDefaultSize(props?: NodeConfig<Text, TextProps>): void {
        const autofit = props?.fontSize === 'autofit';
        this.applyProp("height", props?.height ?? (autofit ? "fill" : "hug"));
        this.applyProp("width", props?.width ?? (autofit || props?.wrap ? "fill" : "hug"));
    }

    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        // Text-on-path: the visual extent is the path's bounding box, not a text
        // line box. Size the node to the path (node-local coords, like Path).
        if (this.path != null) {
            const { width, height } = measurePathData(this.path);
            const wm = this.width;
            const hm = this.height;
            return {
                width: typeof wm === "number" ? wm : wm === "hug" ? width : (constraints.maxWidth ?? width),
                height: typeof hm === "number" ? hm : hm === "hug" ? height : (constraints.maxHeight ?? height),
            };
        }

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

        // "fill" still reports the intrinsic wrapped height when measuring —
        // it's layout (not measure) that stretches a fill child to its final
        // box. This lets a hug ancestor see the text's real content height
        // instead of an arbitrary borrowed constraint.
        const resolvedH = typeof hm === "number"
            ? hm
            : intrinsicH;

        return { width: resolvedW, height: resolvedH };
    }

    *append(text: string, duration: number, easing?: EasingFunction): FrameGenerator {
        yield* this.to({ text: this.text + text }, duration, easing);
    }

    *prepend(text: string, duration: number, easing?: EasingFunction): FrameGenerator {
        yield* this.to({ text: text + this.text }, duration, easing);
    }

    // ---- Text selection ---------------------------------------------------

    /** Live selections in creation order. Later ones win on overlapping glyphs. */
    private _selections: TextSelection[] = [];

    /** @internal Called by {@link TextSelection} on construction. */
    _registerSelection(selection: TextSelection): void {
        this._selections.push(selection);
    }

    /**
     * Select an occurrence of `text`. By default the first occurrence; pass
     * `{ index }` to target the nth (0-based).
     *
     * @example yield* title().find("hello").to({ opacity: 0.5 }, 1);
     */
    find(text: string, opts?: { index?: number }): TextSelection {
        const source = this.text;
        const ranges: TextRange[] = [];
        if (text.length > 0) {
            let from = 0;
            let i: number;
            while ((i = source.indexOf(text, from)) !== -1) {
                ranges.push({ start: i, end: i + text.length });
                from = i + text.length;
            }
        }
        const index = opts?.index ?? 0;
        const picked = ranges[index] ? [ranges[index]] : [];
        return new TextSelection(this, picked);
    }

    /** Select every match of `regex`. A non-global regex matches once. */
    match(regex: RegExp): TextSelection {
        const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
        const re = new RegExp(regex.source, flags);
        const ranges: TextRange[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(this.text)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            ranges.push({ start: m.index, end: m.index + m[0].length });
        }
        return new TextSelection(this, ranges);
    }

    /** Select the nth `\n`-delimited line (0-based), excluding the newline. */
    line(n: number): TextSelection {
        const lines = this.text.split("\n");
        let cursor = 0;
        for (let i = 0; i < lines.length; i++) {
            const len = lines[i].length;
            if (i === n) return new TextSelection(this, [{ start: cursor, end: cursor + len }]);
            cursor += len + 1; // + the consumed "\n"
        }
        return new TextSelection(this, []);
    }

    /** Select every whitespace-delimited word. */
    words(): TextSelection {
        return new TextSelection(this, this._wordRanges());
    }

    /** Select the nth whitespace-delimited word (0-based). */
    word(n: number): TextSelection {
        const r = this._wordRanges()[n];
        return new TextSelection(this, r ? [r] : []);
    }

    /** Select the raw character range `[start, end)`. */
    slice(start: number, end: number): TextSelection {
        return new TextSelection(this, [{ start, end }]);
    }

    /** Select characters for which `predicate` returns true; adjacent hits merge. */
    filter(predicate: (char: string, index: number) => boolean): TextSelection {
        const ranges: TextRange[] = [];
        let runStart = -1;
        for (let i = 0; i < this.text.length; i++) {
            if (predicate(this.text[i], i)) {
                if (runStart === -1) runStart = i;
            } else if (runStart !== -1) {
                ranges.push({ start: runStart, end: i });
                runStart = -1;
            }
        }
        if (runStart !== -1) ranges.push({ start: runStart, end: this.text.length });
        return new TextSelection(this, ranges);
    }

    private _wordRanges(): TextRange[] {
        const ranges: TextRange[] = [];
        const re = /\S+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(this.text)) !== null) {
            ranges.push({ start: m.index, end: m.index + m[0].length });
        }
        return ranges;
    }

    /**
     * Split the text into contiguous pieces at every selection boundary,
     * resolving each piece's effective overrides per the overlap rule:
     * later-created selections win for transform/paint/font; opacity multiplies
     * across all selections covering the piece. Returns null when no active
     * (non-identity) selection exists, so rendering keeps its single-op path.
     */
    private _buildSegments(): TextSegment[] | null {
        const active = this._selections.filter(s => s.ranges.length > 0 && !s.isIdentity);
        if (active.length === 0) return null;

        const text = this.text;
        if (text.length === 0) return null;

        // Boundaries at every range edge so each piece is covered uniformly.
        const cuts = new Set<number>([0, text.length]);
        for (const sel of active) {
            for (const r of sel.ranges) { cuts.add(r.start); cuts.add(r.end); }
        }
        const points = [...cuts].filter(c => c >= 0 && c <= text.length).sort((a, b) => a - b);

        const segments: TextSegment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (end <= start) continue;

            const seg: TextSegment = {
                text: text.slice(start, end),
                fontWeight: this.fontWeight,
                letterSpacing: this.letterSpacing,
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                // Default to the node's paint; selections override below. Each
                // segment is self-contained so the renderer draws runs eagerly.
                fill: this.fill as FillResolved[],
                stroke: this.stroke as StrokeResolved[],
            };

            // Apply in creation order: opacity multiplies, others last-wins.
            for (const sel of active) {
                if (!sel.ranges.some(r => start >= r.start && end <= r.end)) continue;
                const o = sel.overrides;
                seg.opacity *= o.opacity;
                seg.x = o.x;
                seg.y = o.y;
                seg.scale = o.scale;
                seg.rotation = o.rotation;
                seg.fontWeight = o.fontWeight;
                seg.letterSpacing = o.letterSpacing;
                if (o.fill !== null) seg.fill = o.fill;
                if (o.stroke !== null) seg.stroke = o.stroke;
            }
            segments.push(seg);
        }
        return segments;
    }

    /**
     * The descriptor this node draws itself as, at the current frame.
     *
     * `@internal` — split out of {@link textOpGraphics} so `node-picking`'s
     * caret geometry can be measured from *the same* state that gets painted.
     * Deriving the two separately is how a caret ends up half a pixel — or, once
     * `'autofit'` or wrapping is in play, half a line — away from its glyph.
     */
    /** @internal */
    _textState(): Partial<TextState> {
        // Text-on-path and selection segments are mutually exclusive in v1: when a
        // path is set we lay out the single string along the path and skip segments.
        const segments = this.path == null ? this._buildSegments() : null;
        return {
            text: this.text,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            fontWeight: this.fontWeight,
            fontStyle: this.fontStyle,
            letterSpacing: this.letterSpacing,
            lineHeight: this.lineHeight,
            textAlign: this.textAlign,
            wrap: this.wrap,
            minFontSize: this.minFontSize,
            width: this.layoutRect?.width ?? 0,
            height: this.layoutRect?.height ?? 0,
            segments: segments ?? undefined,
            path: this.path,
        };
    }

    // The bare text op as a Graphics (no paint), plus whether selection segments
    // are active. Text has no single fillable silhouette path, so the generic
    // ShapeNode.shapeGraphics() stays null and Text drives its own overlay/stroke
    // passes off this builder instead.
    private textOpGraphics(): { g: Graphics; segments: boolean } {
        const state = this._textState();
        return { g: new Graphics().text(state), segments: state.segments != null };
    }

    protected override renderSelf(ctx: RenderContext): void {
        const { g, segments } = this.textOpGraphics();
        g.shadow(this.shadow);
        // With segments the renderer paints each run eagerly with the segment's
        // own fill/stroke (so per-selection overrides apply), so the node-level
        // fill/stroke ops are omitted to avoid double-painting. Text-on-path uses
        // the normal deferred path, so its node-level fill applies here; its stroke
        // is deferred to renderStroke (drawn after children + overlay).
        if (!segments) {
            g.fill(this.fill);
        }
        ctx.draw(g);
    }

    // Overlay and stroke only apply to the non-segment / text-on-path case; the
    // segmented branch paints its own fill/stroke per run in renderSelf.
    protected override renderOverlay(ctx: RenderContext): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const { g, segments } = this.textOpGraphics();
        if (segments) return;
        ctx.draw(g.fill(overlay));
    }

    protected override renderStroke(ctx: RenderContext): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const { g, segments } = this.textOpGraphics();
        if (segments) return;
        ctx.draw(g.stroke(stroke));
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
