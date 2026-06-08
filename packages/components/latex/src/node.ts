import { RenderContext, EaseFunction, FrameGenerator, getSignal, lerpNumber, NodeConfig, parallel, ShapeNode, Size2D, SizeConstraints, toPathString, tween, PaddingResolved, property, resolvePadding, lerpEdgeInset, FillResolved, AnimationBuilder } from "@motion-script/core";
import { buildLatexPath, LatexToken } from "./geometry";
import { LatexProps } from "./props";
import { AnimatedToken, tweenLatex } from "./tween";


export class Latex extends ShapeNode<LatexProps> {
    getType(): string { return "latex"; }
    getName(): string { return "Latex"; }

    @property({ default: "" }) declare readonly latex: string;
    @property({ default: 16 }) declare readonly fontSize: number;
    @property({ default: 0, mapper: resolvePadding, tween: lerpEdgeInset }) declare readonly padding: PaddingResolved;

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

    constructor(props: NodeConfig<Latex, LatexProps>) {
        super(props);
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

    override to(to: Partial<LatexProps>, duration: number, easing?: EaseFunction): AnimationBuilder<LatexProps> {
        return new AnimationBuilder<LatexProps>(this, { to, duration, easing });
    }

    override *_toGen(to: Partial<LatexProps>, duration: number, easing?: EaseFunction): FrameGenerator {
        const fromTokens: LatexToken[] = this._tokens.map(t => ({ token: t.token, path: t.path }));
        const fromFontSize = this.fontSize;
        const toFontSize = to.fontSize !== undefined ? to.fontSize : this.fontSize;
        const toLatex = to.latex !== undefined ? to.latex : this.latex;

        // Snapshot the from-frame so intrinsic size and the shared center frame
        // can interpolate toward the new formula instead of snapping at the end.
        const fromWidth = this._intrinsicWidth;
        const fromHeight = this._intrinsicHeight;
        const fromBounds = this._bounds;

        const toResult = buildLatexPath(toLatex, toFontSize);
        const toTokens = toResult.tokens;
        const toBounds = toResult.bounds;

        // Drive token interpolation directly; suppress the latex/fontSize
        // subscribers so they don't retokenize each frame.
        this._animating = true;
        try {
            yield* parallel(
                super._toGen(to, duration, easing),
                tween(duration, (rawT) => {
                    const t = easing ? easing(rawT) : rawT;
                    this.set({ fontSize: lerpNumber(fromFontSize, toFontSize, t) });
                    // Track the measured size so a hugging box grows/shrinks
                    // smoothly across the morph rather than jumping when the
                    // final state is committed below.
                    this._intrinsicWidth = lerpNumber(fromWidth, toResult.width, t);
                    this._intrinsicHeight = lerpNumber(fromHeight, toResult.height, t);
                    // Interpolate the shared center frame in lockstep so glyphs
                    // stay centered within the resizing box.
                    this._bounds = [
                        lerpNumber(fromBounds[0], toBounds[0], t),
                        lerpNumber(fromBounds[1], toBounds[1], t),
                        lerpNumber(fromBounds[2], toBounds[2], t),
                        lerpNumber(fromBounds[3], toBounds[3], t),
                    ];
                }),
                tweenLatex(
                    fromTokens,
                    toTokens,
                    duration,
                    (animTokens) => {
                        this._tokens = animTokens;
                    },
                    easing,
                ),
            );
        } finally {
            this._animating = false;
        }

        // Commit final state so subsequent to() calls start from a clean baseline.
        this.set({ latex: toLatex, fontSize: toFontSize });
        this._tokens = toResult.tokens.map(t => ({
            token: t.token,
            path: t.path,
            opacity: 1,
            x: 0,
            y: 0,
        }));
        this._intrinsicWidth = toResult.width;
        this._intrinsicHeight = toResult.height;
        this._bounds = toResult.bounds;
    }

    protected renderSelf(ctx: RenderContext): void {
        for (const token of this._tokens) {
            if (token.opacity <= 0) continue;

            // Scale each token's fill opacity by the token's animated opacity
            const scaledFill = scaleFillopacity(this.fill, token.opacity);

            // Translate the path by token's interpolated position offset
            const pathStr = token.x !== 0 || token.y !== 0
                ? toPathString(offsetPath(token.path, token.x, token.y))
                : toPathString(token.path);

            ctx.path({
                d: pathStr,
                start: this.start,
                end: this.end,
                // All tokens share one center frame so they keep their relative
                // layout — without this each glyph centers on its own bbox and
                // they all stack on the origin.
                centerBounds: this._bounds,
            })
                .fill(scaledFill)
                .stroke(this.stroke).shadow(this.shadow);
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
