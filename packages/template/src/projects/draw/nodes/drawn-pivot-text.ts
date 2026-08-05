import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, Fills,
    Anchor, resolveAnchor, property,
} from "motion-script";

export interface DrawnPivotTextProps extends ShapeProps {
    /** The word/phrase to draw. */
    text: string;
    /** Font size the text is drawn at. */
    fontSize: number;
    /** Font family the text is drawn with. */
    fontFamily: string;
    /**
     * The pivot the drawn text turns about. Either a **named anchor** — the same
     * vocabulary as node `align` (`'center'`, `'topRight'`, `'bottomLeft'`, …),
     * resolved against the word's estimated box — or an explicit `Vector2` in the
     * node's local pixel space (origin at centre).
     *
     * Named `spinPivot` (not `pivot`) so it doesn't shadow the node's own `pivot`
     * (the node-level transform pivot): this is the *graphics-union* pivot.
     *
     * Text contributes *no* measurable bounds to a Graphics union, so a named
     * anchor handed straight to `Graphics.rotation` would fall back to the local
     * origin. This node therefore resolves the anchor itself against the word's
     * estimated box and passes an explicit `Vector2` — which is exactly why a
     * pivot is the only way to steer where text turns.
     */
    spinPivot: Anchor;
    /** Rotation applied to the whole drawn text about {@link spinPivot} (degrees). Animate this. */
    angle: number;
}

/**
 * A node that draws a line of **text from a `Graphics` command** and turns the
 * whole drawn text about a **pivot**, so the text pivot is directly observable.
 *
 * Because text contributes no bounds to a Graphics' measured union, a
 * graphics-level rotation on text-only output would default to pivoting about the
 * local origin. So this node resolves {@link spinPivot} (a named anchor or an
 * explicit `Vector2`) against the word's *estimated* box and passes the concrete
 * point to `Graphics.rotation` — making the pivot the only way to steer where the
 * text turns, which it demonstrates by spinning the same word about different
 * pivots side by side.
 *
 * A ✕ marker is drawn *after* the rotation (so it isn't itself turned) at the
 * pivot, pinning where the text rotates around. The text is authored centred on
 * the node's local origin so the `'center'` pivot lands at the word's middle.
 */
export class DrawnPivotText extends ShapeNode<DrawnPivotTextProps> {

    @property({ default: 'pivot' }) declare readonly text: string;
    @property({ default: 120 }) declare readonly fontSize: number;
    @property({ default: 'Pixelify Sans' }) declare readonly fontFamily: string;
    @property({ default: 'center' }) declare readonly spinPivot: Anchor;
    @property({ default: 0 }) declare readonly angle: number;

    constructor(props: NodeConfig<DrawnPivotText, DrawnPivotTextProps>) {
        super(props);
        // Self-sized to the node's box so it lays out predictably in a stack;
        // the drawn text is centred on the local origin regardless.
        this.applyProp("width", props.width ?? 600);
        this.applyProp("height", props.height ?? 600);
    }

    protected renderSelf(draw: RenderContext): void {
        // Resolve the pivot against the word's estimated box (text has no union
        // bounds for the renderer to anchor against). resolveAnchor gives the
        // normalised [-1,1] (y-up) anchor; map it onto the box in y-up author space.
        const pivot = this.pivotPoint();

        // The graphics-level rotation `center` is one of the few coordinates the
        // renderer takes verbatim in CANVAS (y-down) space — an explicit Vector2
        // pivot is passed straight through `resolveGroupCenter` with no y-up flip
        // (unlike descriptor x/y and named anchors). So negate the y-up pivot's y
        // to hand the group transform its canvas-space pivot.
        const spinCenter = { x: pivot.x, y: -pivot.y };

        // ── The drawn text, turned about the pivot as one unit ────────────────
        // `textAlign: 'center'` + origin `x:0,y:0` centres the word on the local
        // origin, so the `'center'` pivot lands at the word's middle.
        const g = new Graphics()
            .text({
                text: this.text,
                fontSize: this.fontSize,
                fontFamily: this.fontFamily,
                textAlign: 'center',
                x: 0,
                y: 0,
            })
            .fill(this.fill)
            .stroke(this.stroke)
            .rotation(this.angle, spinCenter);

        draw.draw(g);

        // ── Pivot marker: drawn AFTER (so it stays put) at the pivot point ────
        // Authored in y-up (the renderer flips it), so it lands on the canvas-space
        // pivot the rotation actually used (spinCenter = -pivot.y).
        const m = this.fontSize * 0.16;
        const marker = new Graphics()
            .line({ points: [{ x: pivot.x - m, y: pivot.y - m }, { x: pivot.x + m, y: pivot.y + m }] })
            .line({ points: [{ x: pivot.x - m, y: pivot.y + m }, { x: pivot.x + m, y: pivot.y - m }] })
            .stroke({ weight: this.fontSize * 0.06, fill: '#ffffff' });

        draw.draw(marker);

        // A faint ring around the marker so the pivot reads even over the glyphs.
        const ring = new Graphics()
            .ellipse({ x: pivot.x, y: pivot.y, width: m * 3, height: m * 3 })
            .stroke({ weight: this.fontSize * 0.025, fill: Fills.color('#ffffff', { opacity: 0.5 }) });

        draw.draw(ring);
    }

    /** The pivot's pixel point (y-up author space), mapping a named anchor /
     *  Vector2 onto the word's estimated box: width ≈ fontSize·length·0.5,
     *  height ≈ fontSize. */
    private pivotPoint(): { x: number; y: number } {
        const halfW = this.fontSize * this.text.length * 0.25;
        const halfH = this.fontSize * 0.5;
        const a = resolveAnchor(this.spinPivot); // normalised [-1,1], y-up
        return { x: a.x * halfW, y: a.y * halfH };
    }
}
