import type { CodeProps } from "./props";
import { CodeRange, rangeToCharOffsets, charOffsetsToRange } from "./code-range";
import { TokenAdvanceCache } from "./measure-cache";
import {
    IdToken,
    IdLine,
    makeIdToken,
    makeIdLine,
    tokenizeCodeToIdLines,
    splitTokensAt,
} from "./tokens";
import {
    AnimToken,
    Transition,
    TokenState,
    makeAnim,
    resolveTokenStates,
    resolveLineHeightScales,
} from "./transitions";
import { canHighlight, ensureHighlighter } from "./highlight";
import { RenderContext, EaseFunction, FrameGenerator, NodeConfig, parseColor, Size2D, SizeConstraints, Node, tween, MeasureScope, AssetTracker, PaddingResolved, property, resolvePadding, lerpEdgeInset, NormalizedColor } from "@motion-script/core";

// Resolved layout geometry shared by measure() and drawSelf() so the two can't
// drift, and cacheable across static frames. All widths/heights already fold in
// the per-token widthScale and per-line heightScale for the current frame.
interface CodeGeometry {
    lineWidths: number[];   // per-line content width (widthScale applied)
    lineHeights: number[];  // per-line height (heightScale applied)
    maxLineWidth: number;
    gutter: number;
    // Inner content size (no padding) — what measure() needs for hug sizing.
    measuredInnerW: number; // maxLineWidth + gutter
    measuredInnerH: number; // sum of lineHeights
    // Full block including padding — what drawSelf() positions against.
    blockWidth: number;
    blockHeight: number;
    startX: number;
    startY: number;
}


export class Code extends Node<CodeProps> {


    @property({ default: "" }) declare readonly code: string;
    @property({ default: "typescript" }) declare readonly language: string;
    @property({ default: "Fira Mono" }) declare readonly fontFamily: string;
    @property({ default: "github-dark" }) declare readonly theme: string;
    @property({ default: 16 }) declare readonly fontSize: number;
    @property({ default: 1.6 }) declare readonly lineHeight: number;
    // Extra horizontal space added after every glyph (in px), like CSS
    // letter-spacing. Applied per-character so it scales with a token's
    // widthScale during insert/remove/replace animations. Trailing spacing on
    // the last glyph of a token is included in the token's advance, which keeps
    // animated width-collapse seamless.
    @property({ default: 1.1 }) declare readonly letterSpacing: number;
    @property({ default: false }) declare readonly showLineNumbers: boolean;
    // Horizontal gap between the line-number column and the code text, expressed
    // in space-widths (so it scales with fontSize). Only applies when
    // showLineNumbers is on.
    @property({ default: 2 }) declare readonly lineNumberGap: number;
    @property({ default: 0, mapper: resolvePadding, tween: lerpEdgeInset }) declare readonly padding: PaddingResolved;

    private tokenLines: IdLine[] = [];
    private tokenized: boolean = false;

    private transitions: Transition[] = [];

    // Caches expensive scope.measureText() calls; cleared when the font
    // signature (fontSize|fontFamily) changes. See TokenAdvanceCache.
    private advanceCache = new TokenAdvanceCache();

    // Per-frame layout geometry cache. Bumped whenever tokenLines structure
    // changes (see bumpStructure), so a cache hit only happens when content is
    // identical. Only populated on static frames (no active transitions), where
    // widthScale/lineHeightScale are all 1 and the geometry is frame-invariant.
    private structureVersion = 0;
    private layoutCacheKey: string | null = null;
    private layoutCache: CodeGeometry | null = null;

    // Bump the structure version so the next computeGeometry() recomputes rather
    // than reusing a cached layout. Called wherever tokenLines / a line's tokens
    // are reassigned (tokenize/append/prepend/replace/insert/remove).
    private bumpStructure(): void {
        this.structureVersion++;
        this.layoutCache = null;
        this.layoutCacheKey = null;
    }

    // Persistent dim state set by highlight() — applied during render to all
    // tokens whose id is NOT in the highlight set. null means "not highlighting".
    private highlightDimOpacity: number | null = null;
    private highlightedIds: Set<number> = new Set();

    constructor(props: NodeConfig<Code, CodeProps>) {
        super(props);
        this.applyProp("width", props.width ?? "hug");
        this.applyProp("height", props.height ?? "hug");

        // Best-effort: kick off loading this node's actual language/theme so a
        // highlighter rendered outside the asset pipeline still upgrades to full
        // highlighting. The authoritative load runs on the timeline via prepare().
        // We deliberately don't await — tokenize() falls back to plain text until
        // the language is ready, and onRender re-tokenizes once it loads.
        ensureHighlighter([this.theme], [this.language]).catch(() => { });
        this.tokenize();
    }

    set(props: { [K in keyof CodeProps]?: CodeProps[K] | (() => CodeProps[K]) }): void {
        super.set(props);
        if (props.code !== undefined || props.language !== undefined || props.theme !== undefined) {
            this.tokenized = false;
        }
    }

    private tokenize(): void {
        this.tokenLines = tokenizeCodeToIdLines(this.code, this.language, this.theme);
        this.bumpStructure();
        // Only consider ourselves tokenized once we actually highlighted; while
        // the language is still loading we keep retrying on each render.
        this.tokenized = canHighlight(this.language, this.theme);
    }



    prepare(storage: AssetTracker): void {
        // Request the typeface so CanvasKit actually loads it; otherwise the
        // family resolves to a fallback face. We measure and draw with a single
        // fontFamily and no per-token weight, so weight 400 matches what we use.
        storage.requestFont(this.fontFamily, '400');

        // Track the language as a timeline asset: the AssetManager runs this load
        // when the frame window opens (before the scene renders) and disposes it
        // when the window closes. Keyed by language+theme so every frame and every
        // Code node sharing them collapses to one load. Re-tokenizing on the next
        // render is handled by onRender's guard, so the disposer is a no-op
        // (Shiki languages are cheap to keep resident).
        storage.requestLoader(`code:lang:${this.language}|${this.theme}`, async () => {
            await ensureHighlighter([this.theme], [this.language]);
            this.tokenized = false;
            return () => { };
        });
    }

    // A token's advance width, honoring letterSpacing. The renderer applies the
    // same letterSpacing when drawing (see drawSelf), so measure and draw stay
    // in lockstep. fontWeight is left default; letterSpacing is the 5th arg.
    private tokenAdvance(scope: MeasureScope | RenderContext, content: string): number {
        return this.advanceCache.advance(scope, content, this.fontSize, this.fontFamily, this.letterSpacing);
    }

    // Horizontal gap between the line-number column and the code text. Kept in
    // one place so gutterWidth() and the line-number x in drawSelf() agree.
    // Sized in space-widths via the lineNumberGap prop so it scales with font.
    // Measured with letterSpacing 0 — line numbers and the gap don't carry the
    // code's letter-spacing.
    private gutterGap(scope: MeasureScope | RenderContext): number {
        return this.advanceCache.advance(scope, ' ', this.fontSize, this.fontFamily, 0) * this.lineNumberGap;
    }

    private gutterWidth(scope: MeasureScope | RenderContext): number {
        if (!this.showLineNumbers) return 0;
        const maxLine = Math.max(1, this.tokenLines.length);
        const sample = String(maxLine);
        const digitW = this.advanceCache.advance(scope, sample, this.fontSize, this.fontFamily, 0);
        // digit column + the gap that separates the number from the code text.
        return digitW + this.gutterGap(scope);
    }

    // Compute (and, on static frames, cache) all layout geometry. Both measure()
    // and drawSelf() go through here so their sizing can never diverge. The
    // expensive part — per-token advance measurement — is already memoized by
    // advanceCache; this additionally skips the whole loop on static frames where
    // the geometry is identical to the previous frame.
    private computeGeometry(
        scope: MeasureScope | RenderContext,
        stateById: Map<number, TokenState>,
        lineHeightScales: Map<number, number>,
    ): CodeGeometry {
        const pad = this.padding;
        const lineH = this.fontSize * this.lineHeight;

        // A frame is static (geometry-cacheable) when no transition is mid-flight.
        // A persistent highlight dim (highlightDimOpacity) only touches opacity,
        // never widthScale/heightScale, so held-highlight waits stay cacheable.
        const isStatic = this.transitions.length === 0;
        const key = [
            this.structureVersion,
            this.advanceCache.signature(this.fontSize, this.fontFamily),
            pad.left, pad.right, pad.top, pad.bottom,
            this.showLineNumbers ? 1 : 0,
            this.lineNumberGap,
            this.lineHeight,
            this.tokenLines.length,
        ].join("|");

        if (isStatic && this.layoutCache && this.layoutCacheKey === key) {
            return this.layoutCache;
        }

        const gutter = this.gutterWidth(scope);
        const lineWidths: number[] = [];
        const lineHeights: number[] = [];
        let maxLineWidth = 0;
        let measuredInnerH = 0;
        for (const line of this.tokenLines) {
            let w = 0;
            for (const tok of line.tokens) {
                const ws = stateById.get(tok.id)?.widthScale ?? 1;
                w += this.tokenAdvance(scope, tok.content) * ws;
            }
            lineWidths.push(w);
            if (w > maxLineWidth) maxLineWidth = w;
            const h = lineH * (lineHeightScales.get(line.id) ?? 1);
            lineHeights.push(h);
            measuredInnerH += h;
        }

        const measuredInnerW = maxLineWidth + gutter;
        const blockWidth = measuredInnerW + pad.left + pad.right;
        const blockHeight = measuredInnerH + pad.top + pad.bottom;

        const geometry: CodeGeometry = {
            lineWidths,
            lineHeights,
            maxLineWidth,
            gutter,
            measuredInnerW,
            measuredInnerH,
            blockWidth,
            blockHeight,
            startX: -blockWidth / 2 + pad.left + gutter,
            startY: -blockHeight / 2 + pad.top,
        };

        // Only persist on static frames: a geometry computed mid-transition must
        // never be reused once the transition ends.
        if (isStatic) {
            this.layoutCache = geometry;
            this.layoutCacheKey = key;
        } else {
            this.layoutCache = null;
            this.layoutCacheKey = null;
        }

        return geometry;
    }

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        this.advanceCache.sync(this.advanceCache.signature(this.fontSize, this.fontFamily));
        const wm = this.width;
        const hm = this.height;

        const geo = this.computeGeometry(
            scope,
            this.resolveTokenStates(),
            this.resolveLineHeightScales(),
        );

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? geo.measuredInnerW + this.padding.left + this.padding.right
                : constraints.maxWidth ?? 0;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? geo.measuredInnerH + this.padding.top + this.padding.bottom
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    onRender(ctx: RenderContext): void {
        super.onRender(ctx);
        // Keep retrying until the language+theme have actually loaded, so a frame
        // that rendered as plain text upgrades to full highlighting the moment the
        // asset loader resolves. canHighlight gates tokenize from being a no-op
        // re-run every frame once we're done.
        if (!this.tokenized && canHighlight(this.language, this.theme)) {
            this.tokenize();
        }
        this.drawSelf(ctx);
    }

    *append(code: string, duration: number, easing?: EaseFunction): FrameGenerator {
        const newLines = tokenizeCodeToIdLines(code, this.language, this.theme);
        this.tokenLines = [...this.tokenLines, ...newLines];
        this.bumpStructure();

        const animTokens: AnimToken[] = [];
        const lineHeightScales = new Map<number, { values: number[]; keys: number[] }>();
        const introducedIds = new Set<number>();

        for (const line of newLines) {
            lineHeightScales.set(line.id, { keys: [0, 1], values: [0, 1] });
            for (const tok of line.tokens) {
                introducedIds.add(tok.id);
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 1], values: [0, 1] },
                }));
            }
        }

        yield* this.runTransition({ tokens: animTokens, lineHeightScales, introducedIds }, duration, easing);
    }

    *prepend(code: string, duration: number, easing?: EaseFunction): FrameGenerator {
        const newLines = tokenizeCodeToIdLines(code, this.language, this.theme);
        this.tokenLines = [...newLines, ...this.tokenLines];
        this.bumpStructure();

        const animTokens: AnimToken[] = [];
        const lineHeightScales = new Map<number, { values: number[]; keys: number[] }>();
        const introducedIds = new Set<number>();

        for (const line of newLines) {
            lineHeightScales.set(line.id, { keys: [0, 1], values: [0, 1] });
            for (const tok of line.tokens) {
                introducedIds.add(tok.id);
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 1], values: [0, 1] },
                }));
            }
        }

        yield* this.runTransition({ tokens: animTokens, lineHeightScales, introducedIds }, duration, easing);
    }

    /**
     * Highlight a range of code: tokens within the range stay at opacity 1,
     * tokens outside dim to `opacity`. Persistent — call resetHighlight() to
     * undo, or call highlight() again with a different range to cross-fade.
     */
    *highlight(
        codeRange: CodeRange,
        duration: number = 0.4,
        easing?: EaseFunction,
        opacity: number = 0.4,
    ): FrameGenerator {
        const matchIds = this.tokenIdsInRange(codeRange);
        if (matchIds.size === 0) {
            yield* tween(duration, () => { });
            return;
        }

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
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 1], values: [fromOp, toOp] },
                }));
            }
        }

        try {
            yield* this.runTransition({ tokens: animTokens }, duration, easing);
        } finally {
            this.highlightDimOpacity = toDim;
            this.highlightedIds = matchIds;
        }
    }

    /**
     * Fade all dimmed tokens back to opacity 1 and clear the persistent
     * highlight state.
     */
    *resetHighlight(duration: number = 0.4, easing?: EaseFunction): FrameGenerator {
        if (this.highlightDimOpacity === null) {
            yield* tween(duration, () => { });
            return;
        }

        const fromDim = this.highlightDimOpacity;
        const previousIds = this.highlightedIds;

        const animTokens: AnimToken[] = [];
        for (const line of this.tokenLines) {
            for (const tok of line.tokens) {
                const wasHighlighted = previousIds.has(tok.id);
                const fromOp = wasHighlighted ? 1 : fromDim;
                if (fromOp === 1) continue;
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 1], values: [fromOp, 1] },
                }));
            }
        }

        try {
            yield* this.runTransition({ tokens: animTokens }, duration, easing);
        } finally {
            this.highlightDimOpacity = null;
            this.highlightedIds = new Set();
        }
    }

    /**
     * Replace the tokens in `codeRange` with `next`, cross-fading widths and
     * opacities.
     */
    *replace(
        codeRange: CodeRange,
        next: string,
        duration: number,
        easing?: EaseFunction,
    ): FrameGenerator {
        const span = this.rangeToTokenSpan(codeRange);
        if (!span) {
            yield* tween(duration, () => { });
            return;
        }

        const replacementLineGroups = tokenizeCodeToIdLines(next, this.language, this.theme);
        const replacementTokens: IdToken[] = [];
        for (let i = 0; i < replacementLineGroups.length; i++) {
            for (const tok of replacementLineGroups[i].tokens) replacementTokens.push(tok);
            if (i < replacementLineGroups.length - 1) {
                replacementTokens.push(makeIdToken('\n'));
            }
        }

        const oldTokens: IdToken[] = [];
        for (let li = span.fromLine; li <= span.toLine; li++) {
            const line = this.tokenLines[li];
            const start = li === span.fromLine ? span.fromIdx : 0;
            const end = li === span.toLine ? span.toIdx : line.tokens.length;
            for (let ti = start; ti < end; ti++) oldTokens.push(line.tokens[ti]);
        }

        const fromLine = this.tokenLines[span.fromLine];
        const toLine = this.tokenLines[span.toLine];
        const prefix = fromLine.tokens.slice(0, span.fromIdx);
        const suffix = toLine.tokens.slice(span.toIdx);

        const mergedLine: IdLine = makeIdLine([
            ...prefix,
            ...oldTokens,
            ...replacementTokens,
            ...suffix,
        ]);
        mergedLine.id = fromLine.id;

        const before = this.tokenLines.slice(0, span.fromLine);
        const after = this.tokenLines.slice(span.toLine + 1);
        this.tokenLines = [...before, mergedLine, ...after];
        this.bumpStructure();

        const oldIds = new Set(oldTokens.map(t => t.id));

        const animTokens: AnimToken[] = [];
        const introducedIds = new Set<number>();

        for (const tok of oldTokens) {
            animTokens.push(makeAnim(tok.id, {
                opacity: { keys: [0, 0.5, 1], values: [1, 0, 0] },
                widthScale: { keys: [0, 0.5, 1], values: [1, 0, 0] },
            }));
        }
        for (const tok of replacementTokens) {
            introducedIds.add(tok.id);
            animTokens.push(makeAnim(tok.id, {
                opacity: { keys: [0, 0.5, 1], values: [0, 0, 1] },
                widthScale: { keys: [0, 0.5, 1], values: [0, 1, 1] },
            }));
        }

        try {
            yield* this.runTransition({ tokens: animTokens, introducedIds }, duration, easing);
        } finally {
            for (const line of this.tokenLines) {
                line.tokens = line.tokens.filter(tok => !oldIds.has(tok.id));
            }
            this.bumpStructure();
        }
    }

    /**
     * Insert `code` at the given (line, col). Both are 1-indexed; col is the
     * column BEFORE which the new content is inserted (col=1 means start of
     * line). If `code` contains newlines, new lines are created in the middle
     * of the existing line.
     */
    *insert(
        position: [number, number],
        code: string,
        duration: number,
        easing?: EaseFunction,
    ): FrameGenerator {
        if (this.tokenLines.length === 0) {
            this.tokenLines = [makeIdLine([])];
        }
        const [rawLine, rawCol] = position;
        const lineIdx = Math.max(0, Math.min(this.tokenLines.length - 1, rawLine - 1));
        const targetLine = this.tokenLines[lineIdx];
        const lineText = targetLine.tokens.map(t => t.content).join('');
        const col = Math.max(0, Math.min(lineText.length, rawCol - 1));

        // Split the target line's tokens at the character offset `col`.
        const { before: tokBefore, after: tokAfter } = splitTokensAt(targetLine.tokens, col);

        const insertedLineGroups = tokenizeCodeToIdLines(code, this.language, this.theme);
        const animTokens: AnimToken[] = [];
        const lineHeightScales = new Map<number, { values: number[]; keys: number[] }>();
        const introducedIds = new Set<number>();

        // Two curves:
        //   - `newLineIntro`: for tokens on a line that's growing in height
        //     (multi-line insert). Token opacity ramps linearly 0→1 to match
        //     the line's heightScale ramp, so text, line number, and row
        //     height all reveal together. No widthScale anim needed — there's
        //     no existing content at the same x.
        //   - `inlineIntro`: for tokens being spliced into an existing line
        //     (single-line insert). The line's height isn't animating, so the
        //     suffix has to make room horizontally — widthScale 0→1 over the
        //     first half, then opacity fades in over the second half.
        const collectIntro = (toks: IdToken[], mode: 'newLine' | 'inline') => {
            for (const tok of toks) {
                introducedIds.add(tok.id);
                if (mode === 'newLine') {
                    animTokens.push(makeAnim(tok.id, {
                        opacity: { keys: [0, 1], values: [0, 1] },
                    }));
                } else {
                    animTokens.push(makeAnim(tok.id, {
                        opacity: { keys: [0, 0.5, 1], values: [0, 0, 1] },
                        widthScale: { keys: [0, 0.5, 1], values: [0, 1, 1] },
                    }));
                }
            }
        };

        let newLines: IdLine[];
        if (insertedLineGroups.length === 1) {
            // Single-line insertion: splice tokens into the existing line.
            const insertedTokens = insertedLineGroups[0].tokens;
            collectIntro(insertedTokens, 'inline');
            const merged = makeIdLine([...tokBefore, ...insertedTokens, ...tokAfter]);
            merged.id = targetLine.id;
            newLines = [merged];
        } else {
            // Multi-line insertion. Split the inserted content into:
            //   first  = prefix + insertedLineGroups[0]   (sits on the original line)
            //   middle = insertedLineGroups[1..-2]        (entirely new lines)
            //   last   = insertedLineGroups[-1] + suffix  (the original line's tail)
            //
            // Pre-existing tokens (tokBefore, tokAfter) keep their identity and
            // shouldn't animate. Newly tokenized groups fade in.
            //
            // Critical for height animation: the line that contains the host
            // line's pre-existing content must reuse the host id and NOT get a
            // heightScale animation. The other produced lines are genuinely new
            // and get the 0→1 reveal. We pick which side inherits the host id
            // by where the cut lands — if tokAfter is empty (cut at end of
            // line), the first produced line owns the original content. If
            // tokBefore is empty (cut at start), the last produced line owns
            // it. Otherwise both sides hold original content and the first
            // keeps the host id by default.
            const firstInserted = insertedLineGroups[0].tokens;
            const middleInserted = insertedLineGroups.slice(1, -1).map(g => g.tokens);
            const lastInserted = insertedLineGroups[insertedLineGroups.length - 1].tokens;

            // The inheritor side (whichever produced line keeps the host id)
            // doesn't get a height animation, so its inserted tokens need the
            // inline (width-collapse) intro. The genuinely-new lines get the
            // newLine intro (token fade matches the line's height ramp).
            const cutAtStart = tokBefore.length === 0;

            const firstLine = makeIdLine([...tokBefore, ...firstInserted]);
            const middleLines = middleInserted.map(toks => makeIdLine(toks));
            const lastLine = makeIdLine([...lastInserted, ...tokAfter]);

            const inheritor = cutAtStart ? lastLine : firstLine;
            inheritor.id = targetLine.id;

            collectIntro(firstInserted, firstLine === inheritor ? 'inline' : 'newLine');
            for (const m of middleInserted) collectIntro(m, 'newLine');
            collectIntro(lastInserted, lastLine === inheritor ? 'inline' : 'newLine');

            // Every produced line OTHER than the inheritor is genuinely new and
            // grows in height from 0→1.
            const allProduced = [firstLine, ...middleLines, lastLine];
            for (const ln of allProduced) {
                if (ln.id !== targetLine.id) {
                    lineHeightScales.set(ln.id, { keys: [0, 1], values: [0, 1] });
                }
            }

            newLines = allProduced;
        }

        this.tokenLines = [
            ...this.tokenLines.slice(0, lineIdx),
            ...newLines,
            ...this.tokenLines.slice(lineIdx + 1),
        ];
        this.bumpStructure();

        yield* this.runTransition({ tokens: animTokens, lineHeightScales, introducedIds }, duration, easing);
    }

    /**
     * Remove the tokens in `codeRange`. If the range spans whole lines, those
     * lines collapse their height; partial line ranges only remove tokens
     * (the surrounding text reflows).
     */
    *remove(
        codeRange: CodeRange,
        duration: number,
        easing?: EaseFunction,
    ): FrameGenerator {
        const span = this.rangeToTokenSpan(codeRange);
        if (!span) {
            yield* tween(duration, () => { });
            return;
        }

        const removedTokens: IdToken[] = [];
        const fullyRemovedLineIds: number[] = [];

        // A line is "fully removed" when the range covers every one of its
        // tokens. Fully-removed lines get a height collapse + linear fade.
        // Partially-removed lines keep their height; their removed tokens
        // shrink horizontally so the surrounding text reflows.
        for (let li = span.fromLine; li <= span.toLine; li++) {
            const line = this.tokenLines[li];
            const start = li === span.fromLine ? span.fromIdx : 0;
            const end = li === span.toLine ? span.toIdx : line.tokens.length;
            for (let ti = start; ti < end; ti++) removedTokens.push(line.tokens[ti]);
            if (start === 0 && end === line.tokens.length) {
                fullyRemovedLineIds.push(line.id);
            }
        }

        const animTokens: AnimToken[] = [];
        const lineHeightScales = new Map<number, { values: number[]; keys: number[] }>();
        const fullyRemovedLineIdSet = new Set(fullyRemovedLineIds);
        const fullyRemovedTokenIds = new Set<number>();
        for (const line of this.tokenLines) {
            if (fullyRemovedLineIdSet.has(line.id)) {
                for (const tok of line.tokens) fullyRemovedTokenIds.add(tok.id);
            }
        }

        // Whole-line removal: linear fade matching the linear height collapse,
        // so text, line number, and row height all close together.
        for (const lineId of fullyRemovedLineIds) {
            lineHeightScales.set(lineId, { keys: [0, 1], values: [1, 0] });
        }
        for (const tok of removedTokens) {
            if (fullyRemovedTokenIds.has(tok.id)) {
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 1], values: [1, 0] },
                }));
            } else {
                // Partial-line removal: still need width to collapse so the
                // surrounding text on the line doesn't leave a gap.
                animTokens.push(makeAnim(tok.id, {
                    opacity: { keys: [0, 0.5, 1], values: [1, 0, 0] },
                    widthScale: { keys: [0, 0.5, 1], values: [1, 0, 0] },
                }));
            }
        }

        const removedTokenIds = new Set(removedTokens.map(t => t.id));

        try {
            yield* this.runTransition({ tokens: animTokens, lineHeightScales }, duration, easing);
        } finally {
            // Drop the tokens that animated out, then drop any lines that are
            // either marked-fully-removed or have ended up empty.
            const remaining: IdLine[] = [];
            for (const line of this.tokenLines) {
                if (fullyRemovedLineIdSet.has(line.id)) continue;
                line.tokens = line.tokens.filter(tok => !removedTokenIds.has(tok.id));
                remaining.push(line);
            }
            this.tokenLines = remaining;
            this.bumpStructure();
            // Clean up highlight state pointing at removed tokens.
            for (const id of removedTokenIds) this.highlightedIds.delete(id);
        }
    }

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

    /**
     * Find the `index`th range matching `text`. Returns null if not found.
     */
    findRangeAt(text: string, index: number): CodeRange | null {
        const all = this.findAllRanges(text);
        return all[index] ?? null;
    }

    /**
     * Find the first range matching `text`. Returns null if not found.
     */
    findFirstRange(text: string): CodeRange | null {
        return this.findRangeAt(text, 0);
    }

    private *runTransition(
        partial: { tokens: AnimToken[]; lineHeightScales?: Map<number, { values: number[]; keys: number[] }>; introducedIds?: Set<number> },
        duration: number,
        easing?: EaseFunction,
    ): FrameGenerator {
        const transition: Transition = {
            tokens: partial.tokens,
            lineHeightScales: partial.lineHeightScales ?? new Map(),
            progress: 0,
            introducedIds: partial.introducedIds ?? new Set(),
        };
        this.transitions.push(transition);
        try {
            yield* tween(duration, (rawT) => {
                transition.progress = easing ? easing(rawT) : rawT;
            });
        } finally {
            this.transitions = this.transitions.filter(t => t !== transition);
        }
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
                if (tEnd > rStart && tStart < rEnd) {
                    result.add(tok.id);
                }
                off = tEnd;
            }
            if (li < this.tokenLines.length - 1) off += 1; // newline
        }
        return result;
    }

    /**
     * Resolve a CodeRange to a structural (fromLine, fromIdx)..(toLine, toIdx)
     * token span. Snaps to whole tokens (any token that overlaps the range is
     * included). Returns null if no tokens overlap.
     */
    private rangeToTokenSpan(
        codeRange: CodeRange,
    ): { fromLine: number; fromIdx: number; toLine: number; toIdx: number } | null {
        const lineLens = this.lineLengths();
        if (lineLens.length === 0) return null;
        const { start: rStart, end: rEnd } = rangeToCharOffsets(codeRange, lineLens);
        if (rEnd <= rStart) return null;

        let off = 0;
        let fromLine = -1, fromIdx = -1, toLine = -1, toIdx = -1;
        for (let li = 0; li < this.tokenLines.length; li++) {
            const line = this.tokenLines[li];
            for (let ti = 0; ti < line.tokens.length; ti++) {
                const tok = line.tokens[ti];
                const tStart = off;
                const tEnd = off + tok.content.length;
                if (tEnd > rStart && tStart < rEnd) {
                    if (fromLine === -1) { fromLine = li; fromIdx = ti; }
                    toLine = li;
                    toIdx = ti + 1;
                }
                off = tEnd;
            }
            if (li < this.tokenLines.length - 1) off += 1;
        }

        if (fromLine === -1) return null;
        return { fromLine, fromIdx, toLine, toIdx };
    }

    protected drawSelf(draw: RenderContext): void {
        this.advanceCache.sync(this.advanceCache.signature(this.fontSize, this.fontFamily));
        const pad = this.padding;

        const stateById = this.resolveTokenStates();
        const lineHeightScales = this.resolveLineHeightScales();

        const { lineHeights, gutter, blockWidth, startX, startY } =
            this.computeGeometry(draw, stateById, lineHeightScales);

        // Gutter line-number color: a muted version of the standard text color.
        const lineNumColor: NormalizedColorTuple = [0.45, 0.5, 0.55, 1];

        let yCursor = startY;
        // Visible line counter — only fully-non-collapsed lines get a number.
        // We number every modeled line (1-indexed) regardless of hScale so that
        // animations that collapse a line still show its label fading out, which
        // matches normal editor behaviour.
        for (let lineIdx = 0; lineIdx < this.tokenLines.length; lineIdx++) {
            const line = this.tokenLines[lineIdx];
            const hScale = lineHeightScales.get(line.id) ?? 1;
            // The renderer centers each single-token block on the (x, y) we pass
            // (it shifts by -blockWidth/2, -blockHeight/2). So we anchor every
            // token at the *center* of its cell, not its top-left/baseline:
            //   - y: the vertical middle of this line's slot. The slot is
            //     lineHeights[lineIdx] tall (= lineH * hScale); the full-size
            //     glyph block stays centered in it as the slot collapses.
            //   - x: the horizontal middle of each token (set per-token below).
            // Passing lineHeight makes the token block's height deterministic
            // (fontSize * lineHeight) rather than the font's natural metrics, so
            // the vertical center lands exactly on the slot center.
            const centerY = yCursor + lineHeights[lineIdx] / 2;

            if (this.showLineNumbers) {
                const label = String(lineIdx + 1);
                const labelW = this.advanceCache.advance(draw, label, this.fontSize, this.fontFamily, 0);
                // Right-align the number so its right edge sits one gutterGap to
                // the left of where the code text begins.
                const gx = -blockWidth / 2 + pad.left + (gutter - labelW) - this.gutterGap(draw);
                // When a highlight is active, the number dims along with the code
                // unless the WHOLE line is highlighted. We take the min opacity of
                // the line's tokens: a fully-highlighted line is all 1s (bright),
                // any dimmed token drags the number down. This also tweens for
                // free during highlight()/resetHighlight() transitions.
                const lineHighlightOpacity = this.lineHighlightOpacity(line, stateById);
                draw.text({
                    text: label,
                    fontSize: this.fontSize,
                    fontFamily: this.fontFamily,
                    lineHeight: this.lineHeight,
                    x: gx + labelW / 2,
                    y: centerY,
                    align: 'left',
                })
                    .fill([{ type: "color", color: lineNumColor, opacity: hScale * lineHighlightOpacity }]);
            }

            let x = startX;
            for (const token of line.tokens) {
                if (token.content.length === 0) continue;

                const color: NormalizedColor = token.color ? parseColor(token.color) : [0.82, 0.84, 0.86, 1];
                const state = stateById.get(token.id);
                const opacity = (state?.opacity ?? 1) * hScale;
                const offsetY = state?.offsetY ?? 0;
                const widthScale = state?.widthScale ?? 1;
                // Advance width includes letterSpacing, matching what the
                // renderer lays down when drawing with the same letterSpacing.
                const tokWidth = this.tokenAdvance(draw, token.content);

                if (opacity > 0 && widthScale > 0) {
                    draw.text({
                        text: token.content,
                        fontSize: this.fontSize,
                        fontFamily: this.fontFamily,
                        lineHeight: this.lineHeight,
                        letterSpacing: this.letterSpacing,
                        // Token is drawn at its natural width regardless of
                        // widthScale (widthScale only shrinks the advance), so
                        // its visual center is always x + tokWidth/2.
                        x: x + tokWidth / 2,
                        y: centerY + offsetY,
                        align: 'left',
                    })
                        .fill([{ type: "color", color, opacity }]);
                }

                x += tokWidth * widthScale;
            }

            yCursor += lineHeights[lineIdx];
        }
    }

    // Is a highlight currently engaged — either a persistent dim is set, or a
    // highlight()/resetHighlight() cross-fade is mid-flight? Intro/exit
    // animations (append/insert/remove) are NOT highlights, so the line-number
    // dimming below stays inert for them and only `hScale` affects the number.
    private isHighlightActive(): boolean {
        if (this.highlightDimOpacity !== null) return true;
        return this.transitions.some(tr => tr.introducedIds.size === 0
            && tr.lineHeightScales.size === 0);
    }

    // Opacity multiplier for a line's number under the active highlight. The
    // number stays bright only when the WHOLE line is highlighted, so we take
    // the min token opacity on the line. Returns 1 (no dimming) when no
    // highlight is active, so insert/remove intros don't drag the number down.
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

    private resolveLineHeightScales(): Map<number, number> {
        return resolveLineHeightScales(this.transitions);
    }
}

type NormalizedColorTuple = [number, number, number, number];
