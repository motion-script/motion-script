import { lerpText } from "@/attributes/text/lerp";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle, ResolvedTextRun, TextRun } from "@/attributes/text/span";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "@/nodes/2d/node2d";
import { ContextMap } from "@/util/context";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Measurer2D } from "@/render/measurer";
import { Size2D } from "@/attributes/layout/size";
import { EasingFunction } from "@/tween/ease/type";
import { RenderContext2D } from "@/render/render-context2d";
import { Graphics2D } from "@/render/graphics2d";
import { TextSegment, TextState } from "@/render/descriptors/text";
import { FillResolved } from "@/attributes/shape/fill/union";
import { prepareFill, resolveFillArray } from "@/attributes/shape/fill/registry";
import { AssetTracker } from "@/assets/tracker";
import { StrokeResolved, resolveStrokeArray } from "@/attributes/shape/stroke/mapper";
import { PathData } from "@/render/descriptors/path";
import { PathBuilder } from "@/render/descriptors/path-builder";
import { measurePathData } from "@/attributes/shape/path/bounds";
import { AUTOFIT_PROBE_SIZE, TextRange, TextSelection } from "./text-selection";
import { applyTextDefaults } from "@/runtime/builtin-context";
import { type Command } from "@/tween/command";
import { command } from "@/tween/command-decorator";


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
     * Supplies any text-style prop (fontSize, fontWeight, â€¦) not set explicitly
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
    /**
     * Statically styled stretches of {@link text} — see {@link TextRun}.
     *
     * A property rather than a set of {@link TextSelection}s because that is
     * what it is: styling part of a string is a fact about the node, and a host
     * has to be able to restate it the way it restates a family or a size.
     */
    runs: TextRun[];
}

/** Resolve a run list's paints once, on the way into the node's props. */
function resolveTextRuns(value: TextRun[] | undefined): ResolvedTextRun[] {
    if (!Array.isArray(value)) return [];
    return value.map(run => {
        const out: ResolvedTextRun = { ...run, fill: undefined, stroke: undefined };
        if (run.fill !== undefined) out.fill = resolveFillArray(run.fill);
        if (run.stroke !== undefined) out.stroke = resolveStrokeArray(run.stroke);
        if (out.fill === undefined) delete out.fill;
        if (out.stroke === undefined) delete out.stroke;
        return out;
    });
}

/** Coerce the loosely-typed `path` input into stored {@link PathData} (or null). */
function resolveTextPath(value: PathData | PathBuilder | null | undefined): PathData | null {
    if (value == null) return null;
    return value instanceof PathBuilder ? value.toCommands() : value;
}


export class Text extends ShapeNode<TextProps> {



    @property({ default: "", tween: lerpText }) declare readonly text: string;
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
    @property({ default: [], mapper: resolveTextRuns })
    declare readonly runs: ResolvedTextRun[];

    constructor(props: NodeConfig<Text, TextProps>) {
        super(props);
    }

    // Inherit text-style defaults from the nearest ancestor <DefaultTextStyle>
    // for any style prop the author didn't set. This is context-value application
    // (structure is fixed â€” Text has no children), so it belongs in resolveContext,
    // which runs once after the tree + context exist. Writing through _writeProp
    // applies each field's own mapper (e.g. `fill`'s color resolver) once.
    protected override resolveContext(ctx: ContextMap): void {
        applyTextDefaults(this, this._props as Record<string, unknown> | undefined);
    }

    // Text doesn't hug/fill based on children (it has none) â€” it hugs its own
    // glyph box by default, filling only when the box needs to be resolved
    // externally: `autofit` measures glyphs against the allotted box, and
    // `wrap` needs a width to wrap against.
    protected override applyDefaultSize(props?: NodeConfig<Text, TextProps>): void {
        const autofit = props?.fontSize === 'autofit';
        this.applyProp("height", props?.height ?? (autofit ? "fill" : "hug"));
        this.applyProp("width", props?.width ?? (autofit || props?.wrap ? "fill" : "hug"));
    }

    measure(constraints: SizeConstraints, scope: Measurer2D): Partial<Size2D> {
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

        // A styled run changes the box, which is why measuring cannot read the
        // node's five font fields and stop there: one word set two sizes up makes
        // the line taller and the block wider, and a node that hugs its glyphs
        // would hug a box measured for text nobody is looking at. So when
        // selections are live the intrinsic size is summed across the *pieces*,
        // each in its own style - see {@link measureStyledLines}.
        const styled = this.path == null ? this._buildSegments() : null;
        const lineStyles = styled === null
            ? null
            : measureStyledLines(styled, {
                fontFamily: this.fontFamily,
                fontSize: measureFontSize,
                fontStyle: this.fontStyle,
                fontWeight: this.fontWeight,
                letterSpacing: this.letterSpacing,
            });

        const lineH = measureFontSize * this.lineHeight;
        const intrinsicW = lineStyles
            ? Math.max(...lineStyles.map(line => line.runs.reduce(
                (w, run) => w + scope.measureText(run.text, run.fontSize, run.fontFamily, run.fontWeight, run.letterSpacing, run.fontStyle).width,
                0,
            )))
            : Math.max(...paragraphs.map(l => scope.measureText(l, measureFontSize, this.fontFamily, this.fontWeight, this.letterSpacing, this.fontStyle).width));

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
        // Each line is as tall as its tallest run, so raising one word's size
        // opens the leading around it rather than letting it overprint the line
        // above. Only meaningful unwrapped: a wrapped line's pieces are decided
        // by the shaper, which is downstream of this measurement.
        const intrinsicH = lineStyles && lineCount === lineStyles.length
            ? lineStyles.reduce(
                (h, line) => h + Math.max(...line.runs.map(run => run.fontSize)) * this.lineHeight,
                0,
            )
            : lineCount * lineH;

        // "fill" still reports the intrinsic wrapped height when measuring â€”
        // it's layout (not measure) that stretches a fill child to its final
        // box. This lets a hug ancestor see the text's real content height
        // instead of an arbitrary borrowed constraint.
        const resolvedH = typeof hm === "number"
            ? hm
            : intrinsicH;

        return { width: resolvedW, height: resolvedH };
    }

    @command()
    append(text: string, duration: number, easing?: EasingFunction): Command<TextProps> {
        return this.to({ text: this.text + text }, duration, easing);
    }

    @command()
    prepend(text: string, duration: number, easing?: EasingFunction): Command<TextProps> {
        return this.to({ text: text + this.text }, duration, easing);
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
     * @example title().find("hello").to({ opacity: 0.5 }, 1);
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
     * across all selections covering the piece. Also folds in the Write On
     * reveal window (see below). Returns null when neither is active, so
     * rendering keeps its single-op path.
     */
    private _buildSegments(): TextSegment[] | null {
        const active = this._selections.filter(s => s.ranges.length > 0 && !s.isIdentity);
        const text = this.text;
        if (text.length === 0) return null;

        // The node's own styled stretches, clamped to the string it currently
        // holds — a run is stored as two offsets and the text can change under
        // it (an `append`, a `to` on `text`), so the clamp happens here rather
        // than in the mapper, which never sees the string.
        const runs = this.runs
            .map(run => ({
                ...run,
                start: Math.max(0, Math.min(Math.floor(run.start), text.length)),
                end: Math.max(0, Math.min(Math.floor(run.end), text.length)),
            }))
            .filter(run => run.end > run.start);

        // Write On: `start`/`end` are ShapeNode's outline-trim fractions
        // everywhere else, but a glyph has no path to trim geometrically — this
        // CanvasKit build can't get glyph outlines at all (see
        // drawTextUnionStroke in the skia-render stroke handler). Text
        // reinterprets the same pair as a character-reveal window instead:
        // opacity over a character range rather than a geometric trim.
        const hasReveal = this.start > 0 || this.end < 1;
        // The fast path survives all three: a node with no runs, no live
        // selection and no reveal window renders as one string, exactly as it
        // did before any of this existed.
        if (active.length === 0 && runs.length === 0 && !hasReveal) return null;

        // Rounded to the nearest whole character — a hard cut, not a fade. Write
        // On reveals one character at a time, the way DaVinci's does; a fractional
        // in-between character read as an opinionated flourish nobody asked for.
        const revealStart = Math.round(this.start * text.length);
        const revealEnd = Math.round(this.end * text.length);

        // The size every piece starts from. `'autofit'` settles on a size the
        // *block* is measured into, which no single piece can be asked for, so
        // the segmented path shapes at the same probe size a selection's
        // `fontSize` override starts from - one number, stated in one place.
        const nodeFontSize = typeof this.fontSize === "number"
            ? this.fontSize
            : AUTOFIT_PROBE_SIZE;

        // Boundaries at every range edge so each piece is covered uniformly.
        const cuts = new Set<number>([0, text.length]);
        for (const run of runs) { cuts.add(run.start); cuts.add(run.end); }
        for (const sel of active) {
            for (const r of sel.ranges) { cuts.add(r.start); cuts.add(r.end); }
        }
        if (hasReveal) {
            cuts.add(revealStart);
            cuts.add(revealEnd);
        }
        const points = [...cuts].filter(c => c >= 0 && c <= text.length).sort((a, b) => a - b);

        const segments: TextSegment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (end <= start) continue;

            const seg: TextSegment = {
                text: text.slice(start, end),
                // Every shaping field is stated, not left for the renderer to
                // fill in: a piece whose family or size differs from the node's
                // is the point of the model, and a segment that says nothing
                // about one of them would be a piece the paragraph builder
                // styles from the node while the caret measures from the
                // segment. See {@link TextSegment}.
                fontFamily: this.fontFamily,
                fontSize: nodeFontSize,
                fontStyle: this.fontStyle,
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

            // The node's own styling first, in order, last-wins on an overlap —
            // so a selection below can animate a run that is already bold.
            for (const run of runs) {
                if (!(start >= run.start && end <= run.end)) continue;
                if (run.fontFamily !== undefined) seg.fontFamily = run.fontFamily;
                if (run.fontSize !== undefined) seg.fontSize = run.fontSize;
                if (run.fontStyle !== undefined) seg.fontStyle = run.fontStyle;
                if (run.fontWeight !== undefined) seg.fontWeight = run.fontWeight;
                if (run.letterSpacing !== undefined) seg.letterSpacing = run.letterSpacing;
                if (run.fill !== undefined) seg.fill = run.fill;
                if (run.stroke !== undefined) seg.stroke = run.stroke;
            }

            // Apply in creation order: opacity multiplies, others last-wins.
            for (const sel of active) {
                if (!sel.ranges.some(r => start >= r.start && end <= r.end)) continue;
                const o = sel.overrides;
                seg.opacity *= o.opacity;
                seg.x = o.x;
                seg.y = o.y;
                seg.scale = o.scale;
                seg.rotation = o.rotation;
                seg.fontFamily = o.fontFamily;
                seg.fontSize = o.fontSize;
                seg.fontStyle = o.fontStyle;
                seg.fontWeight = o.fontWeight;
                seg.letterSpacing = o.letterSpacing;
                if (o.fill !== null) seg.fill = o.fill;
                if (o.stroke !== null) seg.stroke = o.stroke;
            }

            if (hasReveal && !(start >= revealStart && end <= revealEnd)) {
                seg.opacity = 0;
            }

            segments.push(seg);
        }
        return segments;
    }

    /**
     * The one declaration that makes fonts loadable *before* layout.
     *
     * A family used to be discovered by measuring text against it, which meant
     * the font manager was necessarily still empty when the measurement that
     * discovered it ran â€” so every precomp measurement was made against the
     * fallback face and silently corrected at the first real render. Naming the
     * family here costs nothing and needs no measurement, so a host can collect
     * every font a scene wants, load them, and only then lay out.
     */
    override prepareLayout(tracker: AssetTracker): void {
        tracker.addFont(this.fontFamily, this.fontWeight);
        // ...and every face a *selection* puts on part of the string, which the
        // node's own two fields do not name. A styled run whose family was never
        // declared shapes against the fallback and is silently corrected at the
        // first real render - the exact failure the declaration above exists to
        // prevent, arriving one level down. Same reasoning as `RichText`, which
        // declares its spans' families for this reason.
        const segments = this.path == null ? this._buildSegments() : null;
        for (const segment of segments ?? []) {
            tracker.addFont(segment.fontFamily ?? this.fontFamily, segment.fontWeight);
        }
    }

    /**
     * `ShapeNode` covers `this.fill`/`this.stroke`; this adds what a *selection*
     * overrides them with. A range styled with its own image fill paints a fill
     * that appears nowhere on the node's own props.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        if (this.path != null) return;
        const rect = this.layoutBounds;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        // Null when no selection is active â€” the node's own paint is all there is,
        // and `super` has already declared it.
        const segments = this._buildSegments();
        if (segments === null) return;
        for (const segment of segments) {
            for (const fill of segment.fill ?? []) prepareFill(fill, tracker, width, height);
            for (const stroke of segment.stroke ?? []) {
                for (const fill of stroke.fill) prepareFill(fill, tracker, width, height);
            }
        }
    }

    /**
     * The descriptor this node draws itself as, at the current frame.
     *
     * `@internal` â€” split out of {@link textOpGraphics} so `node-picking`'s
     * caret geometry can be measured from *the same* state that gets painted.
     * Deriving the two separately is how a caret ends up half a pixel â€” or, once
     * `'autofit'` or wrapping is in play, half a line â€” away from its glyph.
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
            width: this.layoutBounds?.width ?? 0,
            height: this.layoutBounds?.height ?? 0,
            segments: segments ?? undefined,
            path: this.path,
        };
    }

    // The bare text op as a Graphics2D (no paint), plus whether selection segments
    // are active. Text has no single fillable silhouette path, so the generic
    // ShapeNode.shapeGraphics() stays null and Text drives its own overlay/stroke
    // passes off this builder instead.
    private textOpGraphics(): { g: Graphics2D; segments: boolean } {
        const state = this._textState();
        return { g: new Graphics2D().text(state), segments: state.segments != null };
    }

    protected override renderSelf(ctx: RenderContext2D): void {
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
    protected override renderOverlay(ctx: RenderContext2D): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const { g, segments } = this.textOpGraphics();
        if (segments) return;
        ctx.draw(g.fill(overlay));
    }

    protected override renderStroke(ctx: RenderContext2D): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const { g, segments } = this.textOpGraphics();
        if (segments) return;
        ctx.draw(g.stroke(stroke));
    }
}

/**
 * One shaped piece of a line, as {@link Text.measure} needs it: its text and the
 * five fields a measurement is taken against.
 */
interface StyledRun {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontStyle: FontStyle;
    fontWeight: number;
    letterSpacing: number;
}

/**
 * Split `segments` into lines at every `\n`, resolving each piece against
 * `fallback` for the fields it leaves unstated.
 *
 * A segment can span a line break - the cuts are made at *selection* edges, and
 * a selection over two lines is one range - so the break has to be found inside
 * the piece rather than between pieces. The newline itself joins neither line,
 * which is what makes an empty line come back as a run of `""` (in the node's
 * own style) rather than disappearing from the count.
 */
function measureStyledLines(
    segments: TextSegment[],
    fallback: Omit<StyledRun, "text">,
): { runs: StyledRun[] }[] {
    const lines: { runs: StyledRun[] }[] = [{ runs: [] }];
    for (const segment of segments) {
        const style: Omit<StyledRun, "text"> = {
            fontFamily: segment.fontFamily ?? fallback.fontFamily,
            fontSize: segment.fontSize ?? fallback.fontSize,
            fontStyle: segment.fontStyle ?? fallback.fontStyle,
            fontWeight: segment.fontWeight,
            letterSpacing: segment.letterSpacing,
        };
        const parts = segment.text.split("\n");
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) lines.push({ runs: [] });
            lines[lines.length - 1].runs.push({ text: parts[i], ...style });
        }
    }
    // A line the loop above never wrote a run onto still has to be measured
    // against something, and the node's own style is the only honest answer.
    for (const line of lines) {
        if (line.runs.length === 0) line.runs.push({ ...fallback, text: "" });
    }
    return lines;
}

function countWrappedLines(
    paragraph: string,
    maxWidth: number,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
    scope: Measurer2D,
    letterSpacing: number = 0,
    fontStyle: FontStyle = 'normal',
): number {
    if (paragraph.length === 0) return 1;
    if (scope.measureText(paragraph, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle).width <= maxWidth) return 1;

    const words = paragraph.split(/(\s+)/).filter(s => s.length > 0);
    let lines = 1;
    let lineW = 0;
    for (const word of words) {
        const w = scope.measureText(word, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle).width;
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
