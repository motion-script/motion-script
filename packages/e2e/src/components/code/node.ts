import type { CodeProps } from "./props";
import { CodeRange, rangeToCharOffsets, charOffsetsToRange } from "./code-range";
import { TokenAdvanceCache } from "./measure-cache";
import { IdLine, tokenizeCodeToIdLines } from "./tokens";
import { diffCode } from "./diff";
import { CodeLayout, CodeMetrics, layoutCode, metricsSignature } from "./layout";
import {
    AnimToken,
    CodeTransition,
    DimTransition,
    EntryDirection,
    StructuralTransition,
    TokenState,
    easeOutCubic,
    makeAnim,
    phasesFor,
    resolveTokenStates,
    smoothstep,
    windowProgress,
} from "./transitions";
import { canHighlight, ensureHighlighter } from "./highlight";
import { CodeTheme, DefaultHighlightStyle } from "./style";
import { RenderContext2D, RenderPass2D, Graphics2D, Clip, EasingFunction, NodeConfig, parseColor, Size2D, SizeConstraints, ShapeNode, Measurer2D, InsetsResolved, property, cornerRadiusProperty, cornerStyleProperty, resolveInsets, lerpInsets, lerpNumber, NormalizedColor, AssetTracker, command, driveCommand, type RectCornerRadius, type RectCornerStyle, type Command, type TweenStepper } from "@motion-script/core";

/** Colour of a token the grammar had no opinion about. */
const DEFAULT_TOKEN_COLOR: NormalizedColor = [0.82, 0.84, 0.86, 1];
/** Gutter line-number colour: a muted version of the standard text colour. */
const LINE_NUMBER_COLOR: NormalizedColor = [0.45, 0.5, 0.55, 1];

// `parseColor` walks a CSS string; a listing asks for the same handful of theme
// colours on every token of every frame, so the parse is memoized. Module-level,
// because the answer depends only on the string.
const colorCache = new Map<string, NormalizedColor>();
function tokenColor(css: string | undefined): NormalizedColor {
    if (!css) return DEFAULT_TOKEN_COLOR;
    let hit = colorCache.get(css);
    if (!hit) {
        hit = parseColor(css);
        colorCache.set(css, hit);
    }
    return hit;
}

function lerpColor(from: NormalizedColor, to: NormalizedColor, t: number): NormalizedColor {
    if (t <= 0) return from;
    if (t >= 1) return to;
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        from[3] + (to[3] - from[3]) * t,
    ];
}

export class Code extends ShapeNode<CodeProps> {

    @property({ default: "" }) declare readonly code: string;
    @property({ default: "typescript" }) declare readonly language: string;
    @property({ default: "Fira Mono" }) declare readonly fontFamily: string;
    @property({ default: DefaultHighlightStyle.name }) declare readonly theme: CodeTheme;
    @property({ default: 16 }) declare readonly fontSize: number;
    @property({ default: 1.6 }) declare readonly lineHeight: number;
    // Extra horizontal space added after every glyph (in px), like CSS
    // letter-spacing. Folded into the advance a token is measured at, so
    // measurement and drawing stay in lockstep.
    @property({ default: 1.1 }) declare readonly letterSpacing: number;
    @property({ default: false }) declare readonly showLineNumbers: boolean;
    // Horizontal gap between the line-number column and the code text, expressed
    // in space-widths (so it scales with fontSize). Only applies when
    // showLineNumbers is on.
    @property({ default: 2 }) declare readonly lineNumberGap: number;
    @property({ default: 0, mapper: resolveInsets, tween: lerpInsets }) declare readonly padding: InsetsResolved;

    // The background box's corners. Declared loose (assignment takes `8` or a
    // per-corner object) while the accessor stores the resolved per-corner value,
    // exactly as `Rect` declares its own — the two draw the same geometry and
    // must accept the same values for it.
    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    /** The settled structure. During an edit, the structure the edit lands on. */
    private tokenLines: IdLine[] = [];
    private tokenized: boolean = false;

    private transitions: CodeTransition[] = [];

    // Caches expensive scope.measureText() calls; cleared when the font
    // signature (fontSize|fontFamily) changes. See TokenAdvanceCache.
    private advanceCache = new TokenAdvanceCache();

    // Layout cache for *settled* frames. Bumped whenever tokenLines is
    // reassigned, so a cache hit only ever happens on identical content. Frames
    // inside a structural edit are served from that edit's own two cached
    // layouts instead (see StructuralTransition).
    private structureVersion = 0;
    private layoutCacheKey: string | null = null;
    private layoutCache: CodeLayout | null = null;

    // Persistent dim state set by highlight() — applied during render to all
    // tokens whose id is NOT in the highlight set. null means "not highlighting".
    private highlightDimOpacity: number | null = null;
    private highlightedIds: Set<number> = new Set();

    constructor(props: NodeConfig<Code, CodeProps>) {
        super(props);
        this.applyProp("width", props.width ?? "hug");
        this.applyProp("height", props.height ?? "hug");

        // Best-effort, for a highlighter constructed outside the asset pipeline
        // entirely (a bare `new Code(...)` in a test or a headless measure). On
        // the timeline the authoritative load is the one `prepareLayout` declares,
        // which `AssetManager.loadAt` awaits *before* this node is laid out — so
        // there the tokens are right the first time rather than upgrading later.
        // (Theme is a synchronous color style; only the language parser loads.)
        ensureHighlighter(undefined, [this.language]).catch(() => { });
        this.tokenize();
    }

    set(props: { [K in keyof CodeProps]?: CodeProps[K] | (() => CodeProps[K]) }): void {
        super.set(props);
        if (props.code !== undefined || props.language !== undefined || props.theme !== undefined) {
            this.tokenized = false;
        }
    }

    private tokenize(): void {
        this.setLines(tokenizeCodeToIdLines(this.code, this.language, this.theme));
        // Only consider ourselves tokenized once we actually highlighted; while
        // the language is still loading we keep retrying on each render.
        this.tokenized = canHighlight(this.language, this.theme);
    }

    /**
     * Swap in a new settled structure, invalidating the layout cache.
     *
     * The one place `tokenLines` is written, because the cache key is a version
     * counter rather than a hash of the content — a write that skipped the bump
     * would keep serving the previous frame's geometry for the new listing.
     */
    private setLines(lines: IdLine[]): void {
        if (this.tokenLines === lines) return;
        this.tokenLines = lines;
        this.structureVersion++;
        this.layoutCache = null;
        this.layoutCacheKey = null;
    }

    /**
     * The monospaced face this block measures and draws with, and the syntax
     * grammar it tokenizes with.
     *
     * Both belong to *layout*: token x positions are measured against the face,
     * and how many tokens there are depends on the grammar. Declared here, the
     * grammar goes on the timeline as an ordinary asset: `AssetManager.loadAt`
     * waits for it before the frame is laid out, so the first measurement is the
     * right one. Deduped by `addAsync`'s key, so a static block doesn't
     * re-dispatch it every frame. Nothing is freed on eviction — parsers are
     * cheap to keep resident.
     */
    override prepareLayout(tracker: AssetTracker): void {
        tracker.addFont(this.fontFamily);
        const language = this.language;
        tracker.addAsync(`shiki:lang:${language}`, async () => {
            await ensureHighlighter(undefined, [language]);
            // The tokens this node holds were produced without the grammar; drop
            // them so the next `onRender` re-runs with highlighting available.
            this.tokenized = false;
        });
    }

    // ── Geometry ────────────────────────────────────────────────────────────

    private metrics(): CodeMetrics {
        return {
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            lineHeight: this.lineHeight,
            letterSpacing: this.letterSpacing,
            padding: this.padding,
            showLineNumbers: this.showLineNumbers,
            lineNumberGap: this.lineNumberGap,
        };
    }

    /** The structural edit currently in flight, if any. */
    private activeEdit(): StructuralTransition | null {
        for (let i = this.transitions.length - 1; i >= 0; i--) {
            const tr = this.transitions[i];
            if (tr.kind === "structural") return tr;
        }
        return null;
    }

    private settledLayout(m: CodeMetrics, scope: Measurer2D | RenderContext2D): CodeLayout {
        const key = `${this.structureVersion}|${metricsSignature(m)}|${this.advanceCache.signature(m.fontSize, m.fontFamily)}`;
        if (this.layoutCache && this.layoutCacheKey === key) return this.layoutCache;
        const layout = layoutCode(this.tokenLines, m, this.advanceCache, scope);
        this.layoutCache = layout;
        this.layoutCacheKey = key;
        return layout;
    }

    /**
     * The one or two layouts this frame is drawn from.
     *
     * A settled frame has one. A frame inside an edit has two — where every
     * token was, and where it is going — and the frame is a point between them.
     * That is the whole reason an insert no longer piles its glyphs at the left
     * margin: a token's destination is *computed*, not approximated by collapsing
     * the advance of everything around it.
     *
     * Both endpoints are fixed for the edit's duration, so they are built once
     * and cached on the transition rather than rebuilt per frame.
     */
    private frameLayout(scope: Measurer2D | RenderContext2D): {
        from: CodeLayout;
        to: CodeLayout;
        edit: StructuralTransition | null;
    } {
        const m = this.metrics();
        const edit = this.activeEdit();
        if (!edit) {
            const layout = this.settledLayout(m, scope);
            return { from: layout, to: layout, edit: null };
        }
        const key = `${metricsSignature(m)}|${this.advanceCache.signature(m.fontSize, m.fontFamily)}`;
        if (edit.layoutKey !== key || !edit.fromLayout || !edit.toLayout) {
            edit.fromLayout = layoutCode(edit.from, m, this.advanceCache, scope);
            edit.toLayout = layoutCode(edit.to, m, this.advanceCache, scope);
            edit.layoutKey = key;
        }
        return { from: edit.fromLayout, to: edit.toLayout, edit };
    }

    /** How far through the "everything reflows" phase this frame is, eased. */
    private moveProgress(edit: StructuralTransition | null): number {
        return edit ? smoothstep(windowProgress(edit.phases.move, edit.progress)) : 1;
    }

    /** How far a whole new row travels as it enters, and along which axis. */
    private entryOffset(direction: EntryDirection): { x: number; y: number } {
        const lineH = this.fontSize * this.lineHeight;
        // y-up author space: a row arriving from *below* starts at a lower y and
        // rises to zero, which is what "slide up" means on screen.
        if (direction === "up") return { x: 0, y: -lineH * 0.85 };
        if (direction === "down") return { x: 0, y: lineH * 0.85 };
        return { x: -this.fontSize * 1.8, y: 0 };
    }

    override measure(constraints: SizeConstraints, scope: Measurer2D): Partial<Size2D> {
        this.advanceCache.sync(this.advanceCache.signature(this.fontSize, this.fontFamily));
        const wm = this.width;
        const hm = this.height;

        const { from, to, edit } = this.frameLayout(scope);
        const t = this.moveProgress(edit);
        const innerW = edit ? lerpNumber(from.innerW, to.innerW, t) : to.innerW;
        const innerH = edit ? lerpNumber(from.innerH, to.innerH, t) : to.innerH;

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? innerW + this.padding.left + this.padding.right
                : constraints.maxWidth ?? 0;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? innerH + this.padding.top + this.padding.bottom
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    protected override renderContent(ctx: RenderPass2D): void {
        // Refuse the ambient `<DefaultTextStyle>` / theme typography defaults for
        // everything drawn inside this node.
        //
        // Those defaults describe the *document's* prose — a display face, a
        // heading weight, a paragraph line-height — and a code block is not prose.
        // Its own props are the vocabulary: `fontFamily` defaults to a monospaced
        // face because column alignment depends on it, `letterSpacing` and
        // `lineHeight` are tuned against that face, and every token is laid out at
        // an x measured from those exact values. A scene-wide serif family or a
        // 700 weight arriving through the draw scope would shape glyphs the
        // geometry was never measured for, and the block would come apart
        // column-by-column rather than merely look different.
        ctx.pushTextStyle(null);
        try {
            // Keep retrying until the language+theme have actually loaded, so a frame
            // that rendered as plain text upgrades to full highlighting the moment the
            // asset loader resolves. Never mid-edit: re-tokenizing mints fresh ids,
            // and an in-flight transition is keyed by the ones it captured.
            if (!this.tokenized && !this.activeEdit() && canHighlight(this.language, this.theme)) {
                this.tokenize();
            }
            super.renderContent(ctx);
        } finally {
            ctx.popTextStyle();
        }
    }

    /**
     * The background box, then the code set on it.
     *
     * Drawn in the slot the base class calls between the transform push and the
     * children, so the block composes like every other shape: shadow and fill
     * (from `super`) under the tokens, children over them, then the overlay
     * across the lot and the stroke around it.
     */
    protected override renderSelf(ctx: RenderContext2D): void {
        super.renderSelf(ctx);
        this.drawSelf(ctx);
    }

    /**
     * The background box: the node's laid-out rect, which is the listing's own
     * measured size (plus `padding`) whenever it hugs.
     *
     * Supplying this is the whole of what gives a code block `fill`, `overlay`,
     * `stroke` and `shadow` — {@link ShapeNode} paints all four through it.
     */
    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().rect({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    /**
     * The same box as a clip outline, so `clip` and any backdrop effect are
     * confined to the block rather than to nothing — a listing set on a card is
     * exactly where a backdrop blur is asked for.
     */
    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // ── Editing commands ────────────────────────────────────────────────────

    /**
     * Append `code` to the end of the listing.
     *
     * Like every other edit here, this is stated as *what the source becomes*
     * and {@link editTo} works out the rest — which is why appending a line that
     * closes a block re-highlights the lines above it, instead of colouring the
     * new text as though it were a program on its own.
     */
    @command()
    append(code: string, duration: number, easing?: EasingFunction): Command<Record<string, never>> {
        return this.editTo(this.joinedSource() + code, duration, easing);
    }

    /** Insert `code` above the listing. */
    @command()
    prepend(code: string, duration: number, easing?: EasingFunction): Command<Record<string, never>> {
        return this.editTo(code + this.joinedSource(), duration, easing);
    }

    /**
     * Insert `code` at the given (line, col). Both are 1-indexed; col is the
     * column BEFORE which the new content is inserted (col=1 means start of
     * line). If `code` contains newlines, new lines are created in the middle
     * of the existing line.
     */
    @command()
    insert(
        position: [number, number],
        code: string,
        duration: number,
        easing?: EasingFunction,
    ): Command<Record<string, never>> {
        const source = this.joinedSource();
        const offset = this.offsetAt(position);
        return this.editTo(source.slice(0, offset) + code + source.slice(offset), duration, easing);
    }

    /**
     * Erase the code in `codeRange`.
     *
     * Named `erase` rather than `remove` because a `Code` is also a node, and
     * `Node.remove(child)` takes a child out of the tree. Two methods spelled
     * the same on one object, doing entirely different things, is worse than one
     * of them having a slightly less obvious name.
     *
     * A range that covers whole lines takes their line breaks with it, so the
     * rows below close up; a range inside a line takes only the characters, and
     * the rest of the line reflows around the hole.
     */
    @command()
    erase(
        codeRange: CodeRange,
        duration: number,
        easing?: EasingFunction,
    ): Command<Record<string, never>> {
        const source = this.joinedSource();
        let { start, end } = rangeToCharOffsets(codeRange, this.lineLengths());
        // `lines(2)` resolves to the *characters* of line 2, not to the row —
        // taking those alone would leave an empty line behind where an editor
        // would have closed the gap. This is also what makes a blank row
        // removable at all: it has no characters, so its range is empty, and
        // "delete nothing" is not what `lines(2)` was asking for.
        const atLineStart = start === 0 || source[start - 1] === "\n";
        const atLineEnd = end === source.length || source[end] === "\n";
        if (atLineStart && atLineEnd) {
            if (end < source.length) end += 1;
            else if (start > 0) start -= 1;
        } else if (end <= start) {
            return driveCommand(duration, () => { });
        }
        if (end <= start) return driveCommand(duration, () => { });
        return this.editTo(source.slice(0, start) + source.slice(end), duration, easing);
    }

    /** Replace the code in `codeRange` with `next`. */
    @command()
    replace(
        codeRange: CodeRange,
        next: string,
        duration: number,
        easing?: EasingFunction,
    ): Command<Record<string, never>> {
        const source = this.joinedSource();
        const { start, end } = rangeToCharOffsets(codeRange, this.lineLengths());
        return this.editTo(source.slice(0, start) + next + source.slice(end), duration, easing);
    }

    /**
     * Highlight a range of code: tokens within the range stay at opacity 1,
     * tokens outside dim to `opacity`. Persistent — call resetHighlight() to
     * undo, or call highlight() again with a different range to cross-fade.
     */
    @command()
    highlight(
        codeRange: CodeRange,
        duration: number = 0.4,
        easing?: EasingFunction,
        opacity: number = 0.4,
    ): Command<Record<string, never>> {
        const matchIds = this.tokenIdsInRange(codeRange);
        if (matchIds.size === 0) return driveCommand(duration, () => { });

        const fromDim = this.highlightDimOpacity ?? 1;
        const toDim = opacity;
        const hadPrevious = this.highlightedIds.size > 0;
        const previousIds = this.highlightedIds;

        const animTokens: AnimToken[] = [];
        for (const line of this.tokenLines) {
            for (const tok of line.tokens) {
                const wasHighlighted = !hadPrevious || previousIds.has(tok.id);
                const isHighlighted = matchIds.has(tok.id);
                const fromOp = wasHighlighted ? 1 : fromDim;
                const toOp = isHighlighted ? 1 : toDim;
                if (fromOp === toOp) continue;
                animTokens.push(makeAnim(tok.id, { keys: [0, 1], values: [fromOp, toOp] }));
            }
        }

        // Which tokens are dimmed is state the *next* highlight reads to know
        // what it is cross-fading from, so it is committed at the end and put
        // back below it — a `finally` could only ever have run forwards.
        return this.runDim(animTokens, duration, easing, (done) => {
            this.highlightDimOpacity = done ? toDim : (hadPrevious ? fromDim : null);
            this.highlightedIds = done ? matchIds : previousIds;
        });
    }

    /**
     * Fade all dimmed tokens back to opacity 1 and clear the persistent
     * highlight state.
     */
    @command()
    resetHighlight(duration: number = 0.4, easing?: EasingFunction): Command<Record<string, never>> {
        if (this.highlightDimOpacity === null) return driveCommand(duration, () => { });

        const fromDim = this.highlightDimOpacity;
        const previousIds = this.highlightedIds;

        const animTokens: AnimToken[] = [];
        for (const line of this.tokenLines) {
            for (const tok of line.tokens) {
                const fromOp = previousIds.has(tok.id) ? 1 : fromDim;
                if (fromOp === 1) continue;
                animTokens.push(makeAnim(tok.id, { keys: [0, 1], values: [fromOp, 1] }));
            }
        }

        return this.runDim(animTokens, duration, easing, (done) => {
            this.highlightDimOpacity = done ? null : fromDim;
            this.highlightedIds = done ? new Set() : previousIds;
        });
    }

    /**
     * Animate the listing to a new source.
     *
     * The engine behind every editing command, and behind `to({ code })`. Every
     * edit is expressed as the source it produces, tokenized, and then *diffed*
     * against what is on screen — so a token that survived the edit keeps its
     * identity and simply travels to its new column, and only what genuinely
     * changed is faded.
     *
     * The result runs in three phases (see {@link phasesFor}): what is leaving
     * fades out, what stays reflows, and only then does what is new arrive.
     * Playing them together is what made a replacement read as a cross-dissolve
     * of two unrelated listings rather than as an edit being made.
     */
    private editTo(next: string, duration: number, easing?: EasingFunction): Command<Record<string, never>> {
        const from = this.tokenLines;
        const fromCode = this.joinedSource();
        if (next === fromCode) return driveCommand(duration, () => { });

        const edit = diffCode(from, tokenizeCodeToIdLines(next, this.language, this.theme));

        const transition: StructuralTransition = {
            kind: "structural",
            from,
            to: edit.lines,
            removedIds: edit.removedIds,
            addedIds: edit.addedIds,
            entryByLine: entryDirections(edit.lines, edit.newLineIds),
            fromColorById: edit.fromColorById,
            phases: phasesFor(edit.removedIds.size > 0, edit.addedIds.size > 0),
            progress: 0,
            layoutKey: null,
            fromLayout: null,
            toLayout: null,
        };

        // A tokenize triggered by the grammar landing mid-edit would mint fresh
        // ids underneath this transition, and the transition is keyed by the ones
        // it captured — so the retry in `onRender` is gated on there being no edit
        // in flight, which means this flag has to be honest now rather than once
        // the edit settles.
        this.tokenized = canHighlight(this.language, this.theme);

        return driveCommand(duration, (t) => {
            const running = t > 0 && t < 1;
            const index = this.transitions.indexOf(transition);
            if (running && index < 0) this.transitions.push(transition);
            else if (!running && index >= 0) this.transitions.splice(index, 1);

            transition.progress = easing ? easing(t) : t;

            // The settle, in both directions: asked for a time before the edit
            // starts, the listing is what preceded it; at or past the end, the
            // result. A `finally` could only ever have run forwards.
            if (t <= 0) {
                this.setLines(from);
                this._writeProp("code", fromCode);
            } else {
                this.setLines(edit.lines);
                this._writeProp("code", next);
            }
        });
    }

    /**
     * Put a dim transition on the stack, drive its progress, take it off and
     * commit at the end.
     *
     * A {@link Command} rather than a generator, which is what makes a listing
     * scrubbable: membership is a function of `t` (on the stack for `0 < t < 1`,
     * off it outside), `settle(done)` replaces the `finally` and takes *which
     * way*, and `progress` is assigned from `t` rather than accumulated.
     */
    private runDim(
        tokens: AnimToken[],
        duration: number,
        easing?: EasingFunction,
        settle?: (done: boolean) => void,
    ): Command<Record<string, never>> {
        const transition: DimTransition = { kind: "dim", tokens, progress: 0 };

        return driveCommand(duration, (t) => {
            const running = t > 0 && t < 1;
            const index = this.transitions.indexOf(transition);
            if (running && index < 0) this.transitions.push(transition);
            else if (!running && index >= 0) this.transitions.splice(index, 1);

            transition.progress = easing ? easing(t) : t;
            settle?.(t >= 1);
        });
    }

    /**
     * Route a tweened `code` through the diff engine.
     *
     * `to({ code })` is the form an author reaches for first — it is how every
     * other prop is animated — and a bare string prop would otherwise land in the
     * generic tween's discrete-snap bucket and simply cut at the end. Intercepted
     * here it becomes the same three-phase edit the named commands produce, while
     * the rest of the step's props tween alongside it untouched.
     */
    override _prepareStep(
        to: Partial<CodeProps>,
        duration: number,
        easing?: EasingFunction,
    ): TweenStepper {
        const next = to.code;
        if (typeof next !== "string" || next === this.joinedSource()) {
            return super._prepareStep(to, duration, easing);
        }

        const rest: Partial<CodeProps> = { ...to };
        delete rest.code;
        // Prepared before the edit, so a step that also moves `fontSize` has
        // snapshotted its own start value against the listing that is still on
        // screen.
        const others = super._prepareStep(rest, duration, easing);
        const edit = this.editTo(next, duration, easing)._stepper();

        return {
            seek: (elapsed: number) => {
                others.seek(elapsed);
                edit.seek(elapsed);
            },
            advance: (dt: number): boolean => {
                const othersDone = others.advance(dt);
                const editDone = edit.advance(dt);
                return othersDone && editDone;
            },
        };
    }

    // ── Source queries ──────────────────────────────────────────────────────

    /**
     * Find every range matching the literal string `text` in the current
     * source. Multi-line matches are supported.
     */
    findAllRanges(text: string): CodeRange[] {
        const ranges: CodeRange[] = [];
        if (!text) return ranges;
        const source = this.joinedSource();
        const lineLens = this.lineLengths();
        let from = 0;
        while (true) {
            const idx = source.indexOf(text, from);
            if (idx === -1) break;
            ranges.push(charOffsetsToRange(idx, idx + text.length, lineLens));
            from = idx + Math.max(1, text.length);
        }
        return ranges;
    }

    /** Find the `index`th range matching `text`. Returns null if not found. */
    findRangeAt(text: string, index: number): CodeRange | null {
        const all = this.findAllRanges(text);
        return all[index] ?? null;
    }

    /** Find the first range matching `text`. Returns null if not found. */
    findFirstRange(text: string): CodeRange | null {
        return this.findRangeAt(text, 0);
    }

    private joinedSource(): string {
        return this.tokenLines
            .map(line => line.tokens.map(t => t.content).join(''))
            .join('\n');
    }

    private lineLengths(): number[] {
        return this.tokenLines.map(line =>
            line.tokens.reduce((acc, t) => acc + t.content.length, 0),
        );
    }

    /** Character offset of a 1-indexed (line, col), clamped into the document. */
    private offsetAt(position: [number, number]): number {
        const lens = this.lineLengths();
        if (lens.length === 0) return 0;
        const [rawLine, rawCol] = position;
        const li = Math.max(0, Math.min(lens.length - 1, rawLine - 1));
        let offset = 0;
        for (let k = 0; k < li; k++) offset += lens[k] + 1;
        return offset + Math.max(0, Math.min(lens[li], rawCol - 1));
    }

    /**
     * Resolve a CodeRange to the set of token ids whose content overlaps the
     * range. Tokens that partially overlap are included.
     */
    private tokenIdsInRange(codeRange: CodeRange): Set<number> {
        const result = new Set<number>();
        const lineLens = this.lineLengths();
        if (lineLens.length === 0) return result;
        const { start: rStart, end: rEnd } = rangeToCharOffsets(codeRange, lineLens);
        if (rEnd <= rStart) return result;

        // Walk tokens with running offsets in the joined string.
        let off = 0;
        for (let li = 0; li < this.tokenLines.length; li++) {
            const line = this.tokenLines[li];
            for (const tok of line.tokens) {
                const tStart = off;
                const tEnd = off + tok.content.length;
                if (tEnd > rStart && tStart < rEnd) result.add(tok.id);
                off = tEnd;
            }
            if (li < this.tokenLines.length - 1) off += 1; // newline
        }
        return result;
    }

    // ── Drawing ─────────────────────────────────────────────────────────────

    protected drawSelf(draw: RenderContext2D): void {
        this.advanceCache.sync(this.advanceCache.signature(this.fontSize, this.fontFamily));

        const dim = this.resolveTokenStates();
        const { from, to, edit } = this.frameLayout(draw);

        const progress = edit ? edit.progress : 1;
        const pOut = edit ? windowProgress(edit.phases.out, progress) : 1;
        const pMove = this.moveProgress(edit);
        const pIn = edit ? windowProgress(edit.phases.in, progress) : 1;
        // Distance an entering row still has to travel: the whole offset when its
        // fade begins, none of it by the time the fade ends.
        const entryTravel = 1 - easeOutCubic(pIn);

        const blockW = edit ? lerpNumber(from.blockW, to.blockW, pMove) : to.blockW;
        const gutter = edit ? lerpNumber(from.gutter, to.gutter, pMove) : to.gutter;
        const gutterGap = to.gutterGap || from.gutterGap;
        // Right edge of the line-number column: one gap to the left of where the
        // code text begins.
        const numberRight = -blockW / 2 + this.padding.left + gutter - gutterGap;

        const drawNumber = (label: string, y: number, opacity: number): void => {
            if (opacity <= 0) return;
            const labelW = this.advanceCache.advance(draw, label, this.fontSize, this.fontFamily, 0);
            draw.draw(new Graphics2D()
                .text({
                    text: label,
                    fontSize: this.fontSize,
                    fontFamily: this.fontFamily,
                    lineHeight: this.lineHeight,
                    x: numberRight - labelW / 2,
                    y,
                    textAlign: 'left',
                })
                .fill([{ type: "solid", color: LINE_NUMBER_COLOR, opacity }]));
        };

        const drawToken = (text: string, x: number, y: number, color: NormalizedColor, opacity: number): void => {
            if (opacity <= 0 || text.length === 0) return;
            const width = this.advanceCache.advance(draw, text, this.fontSize, this.fontFamily, this.letterSpacing);
            draw.draw(new Graphics2D()
                .text({
                    text,
                    fontSize: this.fontSize,
                    fontFamily: this.fontFamily,
                    lineHeight: this.lineHeight,
                    letterSpacing: this.letterSpacing,
                    // The renderer centres a single-token block on the (x, y) it
                    // is given, so every token is anchored at the centre of its
                    // cell rather than at its left edge. Passing lineHeight makes
                    // the block's height deterministic (fontSize × lineHeight)
                    // rather than the font's natural metrics, so the vertical
                    // centre lands exactly on the slot centre.
                    x: x + width / 2,
                    y,
                    textAlign: 'left',
                })
                .fill([{ type: "solid", color, opacity }]));
        };

        // What survived the edit, and what it brought with it — drawn from the
        // structure the edit lands on.
        for (let i = 0; i < this.tokenLines.length; i++) {
            const line = this.tokenLines[i];
            const toIndex = to.lineIndex.get(line.id);
            if (toIndex === undefined) continue;
            const toY = to.lineY[toIndex];

            const direction = edit?.entryByLine.get(line.id);
            let rowY = toY;
            let rowDX = 0;
            let rowAlpha = 1;
            if (edit && direction) {
                // A wholly new row travels as one piece — the line arrives, not a
                // spray of glyphs each finding its own way in.
                const offset = this.entryOffset(direction);
                rowY = toY + offset.y * entryTravel;
                rowDX = offset.x * entryTravel;
                rowAlpha = pIn;
            } else if (edit) {
                const fromIndex = from.lineIndex.get(line.id);
                if (fromIndex !== undefined) rowY = lerpNumber(from.lineY[fromIndex], toY, pMove);
            }

            if (this.showLineNumbers) {
                drawNumber(String(i + 1), rowY, rowAlpha * this.lineHighlightOpacity(line, dim));
            }

            for (const token of line.tokens) {
                const box = to.tokens.get(token.id);
                if (!box) continue;

                let x = box.x + rowDX;
                let alpha = rowAlpha;
                let color = tokenColor(token.color);

                if (edit && !direction) {
                    if (edit.addedIds.has(token.id)) {
                        // Spliced into a row that already existed: the reflow
                        // already opened the space, so this only has to appear.
                        alpha = pIn;
                    } else {
                        const was = from.tokens.get(token.id);
                        if (was) x = lerpNumber(was.x, box.x, pMove);
                        if (edit.fromColorById.has(token.id)) {
                            color = lerpColor(tokenColor(edit.fromColorById.get(token.id)), color, pMove);
                        }
                    }
                }

                drawToken(token.content, x, rowY, color, alpha * (dim.get(token.id)?.opacity ?? 1));
            }
        }

        // What the edit takes away, drawn from the structure it is leaving — it
        // has no place in the new one, which is the whole reason it is fading.
        if (edit && pOut < 1) {
            for (let i = 0; i < edit.from.length; i++) {
                const line = edit.from[i];
                const fromIndex = from.lineIndex.get(line.id);
                if (fromIndex === undefined) continue;
                const toIndex = to.lineIndex.get(line.id);
                // A row that survived the edit is still moving, so its outgoing
                // tokens travel with it; a deleted row stays where it was and
                // dissolves while the rows below close over it.
                const y = toIndex === undefined
                    ? from.lineY[fromIndex]
                    : lerpNumber(from.lineY[fromIndex], to.lineY[toIndex], pMove);

                let drewAny = false;
                for (const token of line.tokens) {
                    if (!edit.removedIds.has(token.id)) continue;
                    const box = from.tokens.get(token.id);
                    if (!box) continue;
                    drewAny = true;
                    drawToken(token.content, box.x, y, tokenColor(token.color), 1 - pOut);
                }
                if (drewAny && toIndex === undefined && this.showLineNumbers) {
                    drawNumber(String(i + 1), y, 1 - pOut);
                }
            }
        }
    }

    // Is a highlight currently engaged — either a persistent dim is set, or a
    // highlight()/resetHighlight() cross-fade is mid-flight? A structural edit is
    // NOT a highlight, so the line-number dimming below stays inert for one.
    private isHighlightActive(): boolean {
        if (this.highlightDimOpacity !== null) return true;
        return this.transitions.some(tr => tr.kind === "dim");
    }

    // Opacity multiplier for a line's number under the active highlight. The
    // number stays bright only when the WHOLE line is highlighted, so we take
    // the min token opacity on the line. Returns 1 (no dimming) when no
    // highlight is active, so an edit's entries don't drag the number down.
    private lineHighlightOpacity(line: IdLine, stateById: Map<number, TokenState>): number {
        if (!this.isHighlightActive()) return 1;
        let min = 1;
        for (const tok of line.tokens) {
            if (tok.content.length === 0) continue;
            const op = stateById.get(tok.id)?.opacity ?? 1;
            if (op < min) min = op;
        }
        return min;
    }

    private resolveTokenStates(): Map<number, TokenState> {
        return resolveTokenStates(
            this.tokenLines,
            this.transitions,
            this.highlightDimOpacity,
            this.highlightedIds,
        );
    }
}

/**
 * Where each wholly new row enters from, relative to the code that was already
 * there: rows added below it rise into place, rows added above it descend, and
 * rows spliced between existing ones slide in from the left.
 *
 * That distinction is the difference between an edit that reads as *content
 * arriving* and one that reads as a list redrawing itself — a row appended to the
 * end has to come from off the bottom, because that is where the block just grew.
 */
function entryDirections(lines: IdLine[], newLineIds: Set<number>): Map<number, EntryDirection> {
    const out = new Map<number, EntryDirection>();
    let first = -1;
    let last = -1;
    for (let i = 0; i < lines.length; i++) {
        if (newLineIds.has(lines[i].id)) continue;
        if (first < 0) first = i;
        last = i;
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!newLineIds.has(line.id)) continue;
        // Nothing survived, so there is no "within" to speak of: the whole
        // listing is arriving, and it arrives from below like appended content.
        if (first < 0) out.set(line.id, "up");
        else out.set(line.id, i < first ? "down" : i > last ? "up" : "right");
    }
    return out;
}
