import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, Fills,
    Alignment, resolvePivot, property,
} from "motion-script";

export interface DrawnPivotProps extends ShapeProps {
    /** Half-width of the design box the commands are authored in. */
    extent: number;
    /**
     * The pivot the whole drawn union turns about — passed straight to
     * `Graphics.rotation(angle, center)`. Either a **named anchor** (`'center'`,
     * `'topRight'`, `'bottomLeft'`, … — the node `align` vocabulary), which the
     * renderer resolves against the union's bounding box, or an explicit
     * `Vector2` in local pixels.
     *
     * Named `spinPivot` (not `pivot`) so it doesn't shadow the node's own `pivot`
     * (the node-level transform pivot): this is the *graphics-union* pivot.
     */
    spinPivot: Alignment;
    /** Rotation applied to the whole union about {@link spinPivot} (degrees). Animate this. */
    angle: number;
}

/**
 * A node that paints one drawn figure and turns the *entire union* about a
 * **pivot**, so the pivot's effect is directly observable.
 *
 * The figure is a stylised clock hand — a rounded-rect shaft growing up out of a
 * round hub, with a notch cut from the shaft — recorded as a single
 * {@link Graphics} command list. The whole silhouette is then rotated with
 * `g.rotation(this.angle, this.spinPivot)`: every shape turns together about that
 * one point. Because `spinPivot` is a prop, three identical figures can be placed
 * side by side, each spun about a different pivot (its centre, a corner, an
 * external point) to make the pivot directly comparable. It accepts a named anchor
 * (`'center'`, `'topRight'`, …) or an explicit `Vector2` in local pixels.
 *
 * A small ✕ marker is drawn *after* the rotation (so it isn't itself turned) at
 * the pivot location, pinning where the figure is rotating around.
 *
 * All coordinates are authored in a box centred on the node's local origin,
 * spanning `[-extent, -extent] … [+extent, +extent]`.
 */
export class DrawnPivot extends ShapeNode<DrawnPivotProps> {

    @property({ default: 300 }) declare readonly extent: number;
    @property({ default: 'center' }) declare readonly spinPivot: Alignment;
    @property({ default: 0 }) declare readonly angle: number;

    constructor(props: NodeConfig<DrawnPivot, DrawnPivotProps>) {
        super(props);
        // Self-sized to the design box; default to hugging it so a bare
        // <DrawnPivot /> lays out at its natural size in any container.
        this.applyProp("width", props.width ?? props.extent ?? 300 * 2);
        this.applyProp("height", props.height ?? props.extent ?? 300 * 2);
    }

    protected renderSelf(draw: RenderContext): void {
        const e = this.extent;

        // ── The figure: a clock hand turned about the pivot as one union ──────
        // A round hub at local origin with a tall rounded-rect shaft rising from
        // it; a slim notch is cut from the shaft so the union reads as one solid
        // drawn silhouette (not stacked primitives). `spinPivot` is handed straight
        // to g.rotation — the renderer resolves a named anchor against the union's
        // bbox, so the whole thing turns about that point.
        const figure = new Graphics()
            // Shaft: a tall rounded rect rising up from the hub (y-up: +y is up).
            .rect({ x: 0, y: e * 0.35, width: e * 0.22, height: e * 1.3, cornerRadius: e * 0.11 })
            // Hub: a disc at the local origin (the figure's natural anchor).
            .ellipse({ x: 0, y: 0, width: e * 0.5, height: e * 0.5 })
            // Notch: a small slot cut near the top of the shaft, so the union is one surface.
            .rect({ x: 0, y: e * 0.62, width: e * 0.1, height: e * 0.34, cornerRadius: e * 0.05 })
            .cut()
            .fill(this.fill)
            .stroke(this.stroke)
            // Turn the WHOLE union about the pivot — the whole point.
            .rotation(this.angle, this.spinPivot);

        draw.draw(figure);

        // ── Pivot marker: drawn AFTER (so it doesn't rotate) at the pivot ─────
        // resolvePivot gives the normalised [-1,1] (y-up) anchor; map it onto the
        // figure's [-e, +e] box in y-up author space (the renderer flips y to
        // canvas). A ✕ pins where the figure turns around.
        const marker = this.pivotPoint(e);
        const m = e * 0.07;
        const cross = new Graphics()
            .line({ points: [{ x: marker.x - m, y: marker.y - m }, { x: marker.x + m, y: marker.y + m }] })
            .line({ points: [{ x: marker.x - m, y: marker.y + m }, { x: marker.x + m, y: marker.y - m }] })
            .stroke({ weight: e * 0.03, fill: '#ffffff' });

        draw.draw(cross);

        // A faint ring around the marker so the pivot reads even over the figure.
        const ring = new Graphics()
            .ellipse({ x: marker.x, y: marker.y, width: e * 0.2, height: e * 0.2 })
            .stroke({ weight: e * 0.012, fill: Fills.color('#ffffff', { opacity: 0.5 }) });

        draw.draw(ring);
    }

    /** The pivot's pixel point (y-up author space) for the marker, mapping a named
     *  anchor / Vector2 onto the figure's `[-e, +e]` box (matching the renderer's
     *  bbox resolution). */
    private pivotPoint(e: number): { x: number; y: number } {
        const a = resolvePivot(this.spinPivot); // normalised [-1,1], y-up
        return { x: a.x * e, y: a.y * e };
    }
}
