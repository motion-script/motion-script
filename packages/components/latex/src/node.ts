import { RenderContext2D, Graphics2D, EasingFunction, getSignal, lerpNumber, NodeConfig, ShapeNode, ShapeProps, InsetsProps, Size2D, SizeConstraints, toPathString, InsetsResolved, property, resolveInsets, lerpInsets, FillResolved, driveCommand, type Command, type TweenStepper } from "@motion-script/core";
import { buildLatexPath, defaultLatexMorph, type AnimatedToken, type LatexMorphStrategy, type LatexToken } from "./engine";

export interface LatexProps extends ShapeProps {
    latex: string;
    fontSize: number;
    padding: InsetsProps;
}

/**
 * Construction-time-only options: pluggable engine behavior, set once when
 * the node is created. Deliberately *not* part of {@link LatexProps} — every
 * `@property` field accepts either a value or a zero-arg reactive binding
 * (`value | (() => value)`, see `PropInputs`), and the node's own reactive
 * write path (`_writeProp`) treats any function value as the latter. A
 * strategy *is* a function, so it can't be told apart from a binding that
 * computes one — it has to stay outside the reactive prop system entirely.
 */
export interface LatexStrategies {
    /** How the node morphs between two formulas. Defaults to `defaultLatexMorph`. */
    morph?: LatexMorphStrategy;
}

export class Latex extends ShapeNode<LatexProps> {
    @property({ default: "" }) declare readonly latex: string;
    @property({ default: 16 }) declare readonly fontSize: number;
    @property({ default: 0, mapper: resolveInsets, tween: lerpInsets }) declare readonly padding: InsetsResolved;

    /**
     * How this node morphs between two formulas. Construction-time-only (see
     * {@link LatexStrategies}) — resolved once here rather than left as
     * `?? defaultLatexMorph` at every call site.
     */
    private readonly morph: LatexMorphStrategy;

    private _intrinsicWidth: number = 0;
    private _intrinsicHeight: number = 0;

    /**
     * Shared center frame for all current tokens, [minX, minY, maxX, maxY] in
     * token space. Passed to every per-token path so glyphs keep their relative
     * layout instead of each centering on its own bbox.
     */
    private _bounds: [number, number, number, number] = [0, 0, 0, 0];

    /** Current tokens to render. Each has its own opacity for tween transitions. */
    private _tokens: AnimatedToken[] = [];

    /** Suppresses reactive retokenization while a custom to() is driving frames. */
    private _animating: boolean = false;

    constructor(props: NodeConfig<Latex, LatexProps> & LatexStrategies) {
        super(props);
        this.morph = props.morph ?? defaultLatexMorph;
        this.applyProp("width", props.width ?? "hug");
        this.applyProp("height", props.height ?? "hug");

        // Re-tokenize whenever latex or fontSize changes (including reactive
        // bindings from upstream signals).
        getSignal(this, "latex")!.subscribe(() => this._updateTokens());
        getSignal(this, "fontSize")!.subscribe(() => this._updateTokens());

        this._updateTokens();
    }

    private _updateTokens() {
        if (this._animating) return;
        if (this.latex) {
            const result = buildLatexPath(this.latex, this.fontSize);
            this._intrinsicWidth = result.width;
            this._intrinsicHeight = result.height;
            this._bounds = result.bounds;
            this._tokens = result.tokens.map(t => ({
                token: t.token,
                path: t.path,
                opacity: 1,
                x: 0,
                y: 0,
            }));
        } else {
            this._tokens = [];
            this._intrinsicWidth = 0;
            this._intrinsicHeight = 0;
            this._bounds = [0, 0, 0, 0];
        }
    }

    override measure(constraints: SizeConstraints): Partial<Size2D> {
        const pad = this.padding;
        const wm = this.width;
        const hm = this.height;

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? this._intrinsicWidth + pad.left + pad.right
                : constraints.maxWidth ?? 0;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? this._intrinsicHeight + pad.top + pad.bottom
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    /**
     * A LaTeX morph — one {@link Command}, like every other `to()`.
     *
     * Sequence two of them with `sequence(...)` rather than chaining: the chain
     * builder this used to return existed only so `latexRef().to(a, 1).to(b, 1)`
     * would read as two steps, and it could not compose with anything that was
     * not another Latex morph.
     */
    override to(to: Partial<LatexProps>, duration: number, easing?: EasingFunction): Command<LatexProps> {
        return this._buildMorph(to, duration, easing);
    }

    /**
     * Build a single LaTeX morph as a {@link Command}: every ordinary
     * `ShapeProps` field (via the inherited `_prepareStep`), plus the
     * intrinsic size, shared center frame and per-glyph token list — state a
     * plain `set()` can't reach — driven together by one eased `t`, matching
     * the concurrent `parallel` the generator version ran.
     *
     * The "from" snapshot (`fromTokens`, `fromLatex`, …) is captured
     * **lazily, on the command's first evaluation**, not when this is called.
     * That is what lets two morphs be sequenced: `commandSequence` settles each
     * prior step before evaluating the next, so a second morph's "from" reads
     * the first one's end state rather than whatever the node held before either
     * of them ran.
     *
     * `_animating` suppresses the `latex`/`fontSize` signal subscribers
     * (`_updateTokens`) for the open interval, and both ends commit: `t === 1`
     * lands on the target formula, `t === 0` restores the source one — the same
     * "membership for the open interval, commit at either end" shape
     * `packages/components/code`'s `runTransition` uses, so seeking into either
     * side of the morph (not just running it forward) shows the right thing.
     *
     * `@internal` — the entry point for authors is {@link to}.
     */
    _buildMorph(to: Partial<LatexProps>, duration: number, easing?: EasingFunction): Command<LatexProps> {
        let setupDone = false;
        let fromAnimTokens: AnimatedToken[] = [];
        let fromLatex = "";
        let fromFontSize = 0;
        let fromWidth = 0;
        let fromHeight = 0;
        let fromBounds: [number, number, number, number] = [0, 0, 0, 0];
        let toFontSize = 0;
        let toLatex = "";
        let toResult: ReturnType<typeof buildLatexPath>;
        let propStep: TweenStepper;
        let latexFrame: (t: number) => AnimatedToken[];

        const setup = (): void => {
            setupDone = true;
            const fromTokens: LatexToken[] = this._tokens.map(t => ({ token: t.token, path: t.path }));
            fromAnimTokens = this._tokens.map(t => ({ ...t }));
            fromLatex = this.latex;
            fromFontSize = this.fontSize;
            fromWidth = this._intrinsicWidth;
            fromHeight = this._intrinsicHeight;
            fromBounds = this._bounds;

            toFontSize = to.fontSize !== undefined ? to.fontSize : this.fontSize;
            toLatex = to.latex !== undefined ? to.latex : this.latex;
            toResult = buildLatexPath(toLatex, toFontSize);

            propStep = this._prepareStep(to, duration);
            latexFrame = this.morph(fromTokens, toResult.tokens);
        };

        return driveCommand(duration, (t) => {
            if (!setupDone) setup();
            const toBounds = toResult.bounds;

            this._animating = true;
            propStep.seek(t * duration);
            this.set({ fontSize: lerpNumber(fromFontSize, toFontSize, t) });
            // Track the measured size so a hugging box grows/shrinks smoothly
            // across the morph rather than jumping when the end commits.
            this._intrinsicWidth = lerpNumber(fromWidth, toResult.width, t);
            this._intrinsicHeight = lerpNumber(fromHeight, toResult.height, t);
            // Interpolate the shared center frame in lockstep so glyphs stay
            // centered within the resizing box.
            this._bounds = [
                lerpNumber(fromBounds[0], toBounds[0], t),
                lerpNumber(fromBounds[1], toBounds[1], t),
                lerpNumber(fromBounds[2], toBounds[2], t),
                lerpNumber(fromBounds[3], toBounds[3], t),
            ];
            this._tokens = latexFrame(t);

            if (t >= 1) {
                this.set({ latex: toLatex, fontSize: toFontSize });
                this._tokens = toResult.tokens.map(tok => ({ token: tok.token, path: tok.path, opacity: 1, x: 0, y: 0 }));
                this._intrinsicWidth = toResult.width;
                this._intrinsicHeight = toResult.height;
                this._bounds = toResult.bounds;
                this._animating = false;
            } else if (t <= 0) {
                this.set({ latex: fromLatex, fontSize: fromFontSize });
                this._tokens = fromAnimTokens;
                this._intrinsicWidth = fromWidth;
                this._intrinsicHeight = fromHeight;
                this._bounds = fromBounds;
                this._animating = false;
            }
        }, easing) as Command<LatexProps>;
    }

    protected renderSelf(ctx: RenderContext2D): void {
        this.eachToken(ctx, (graphics, opacity) => graphics
            .fill(scaleFillopacity(this.fill as FillResolved[], opacity))
            .stroke(this.stroke).shadow(this.shadow));
    }

    /**
     * The overlay, painted *through* the glyphs.
     *
     * `ShapeNode`'s inherited overlay pass fills whatever {@link
     * ShapeNode.shapeGraphics} describes, and this node describes nothing there:
     * a formula has no single fillable silhouette — its silhouette *is* the list
     * of token paths, which is why `renderSelf` is overridden rather than a
     * `shapeGraphics` supplied. So the generic pass drew nothing and an overlay
     * set on a LaTeX node simply never appeared, with no error to say why.
     *
     * Painted the same way the fill is: one `Graphics2D` per token, all sharing the
     * centre frame, each scaled by its token's animated opacity — so a morph
     * carries the overlay along with the glyph it is laid over instead of leaving
     * a wash hanging over glyphs that have faded out.
     *
     * The stroke is *not* re-drawn here. `renderSelf` already strokes each token
     * (there is no silhouette for the deferred {@link ShapeNode.renderStroke} to
     * outline), so it is painted under the overlay rather than over it — the one
     * place this node's draw order differs from a plain shape's, and the price of
     * a stroke that follows glyphs rather than a box.
     */
    protected override renderOverlay(ctx: RenderContext2D): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        this.eachToken(ctx, (graphics, opacity) => graphics.fill(scaleFillopacity(overlay, opacity)));
    }

    /**
     * Draws every visible token's path once, handing each one to `paint` to have
     * its paint ops appended.
     *
     * A fresh `Graphics2D` per token per pass, because `.fill()`/`.stroke()` push
     * onto one op list and return `this` — a silhouette shared between the fill
     * pass and the overlay pass would accumulate both.
     */
    private eachToken(ctx: RenderContext2D, paint: (graphics: Graphics2D, opacity: number) => Graphics2D): void {
        for (const token of this._tokens) {
            if (token.opacity <= 0) continue;

            // Translate the path by token's interpolated position offset
            const pathStr = token.x !== 0 || token.y !== 0
                ? toPathString(offsetPath(token.path, token.x, token.y))
                : toPathString(token.path);

            ctx.draw(paint(new Graphics2D()
                .path({
                    data: pathStr,
                    start: this.start,
                    end: this.end,
                    // All tokens share one center frame so they keep their relative
                    // layout — without this each glyph centers on its own bbox and
                    // they all stack on the origin.
                    centerBounds: this._bounds,
                }), token.opacity));
        }
    }
}

function scaleFillopacity(fills: FillResolved[], opacity: number): FillResolved[] {
    if (opacity >= 1) return fills;
    return fills.map(f => ({ ...f, opacity: (f.opacity ?? 1) * opacity }));
}

function offsetPath(
    path: LatexToken["path"],
    dx: number,
    dy: number,
): LatexToken["path"] {
    return path.map(cmd => {
        const c = cmd as any;
        const shifted: any = { ...c };
        if ("x" in c) shifted.x = c.x + dx;
        if ("y" in c) shifted.y = c.y + dy;
        if ("x1" in c) { shifted.x1 = c.x1 + dx; shifted.y1 = c.y1 + dy; }
        if ("x2" in c) { shifted.x2 = c.x2 + dx; shifted.y2 = c.y2 + dy; }
        return shifted;
    });
}
