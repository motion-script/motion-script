import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, Fills,
    AnchorKey, Vector2, property,
} from "motion-script";

export interface DrawnShapePivotProps extends ShapeProps {
    /** Half-width of the design box the figure is authored in. */
    extent: number;
    /**
     * Which **cardinal anchor** of the rect is pinned to the target point — the
     * new `Graphics().rect({ <anchor>: { x, y } })` positioning API. One of the
     * nine `align` names (`'center'`, `'topRight'`, `'bottomLeft'`, …).
     */
    anchor: AnchorKey;
    /**
     * The point (y-up, local pixels) the rect's {@link anchor} should land on.
     * A ✕ is drawn here independently, so a correct anchor lands the rect's named
     * corner exactly on the ✕.
     */
    target: Vector2;
}

/**
 * A node that **tests the cardinal-point positioning API** on `Graphics` shapes.
 *
 * It draws one rect positioned *purely by a named anchor* —
 * `g.rect({ [anchor]: target, width, height })` — and, independently, a ✕ marker
 * at `target`. If the anchor works, the rect's named corner (its top-right, its
 * bottom-left, …) lands exactly on the ✕. No `x`/`y` is given to the rect: the
 * anchor alone places it. Because `anchor` and `target` are props, the same node
 * can be dropped in side by side to check every cardinal point against a fixed
 * point.
 *
 * All coordinates are authored y-up in a box centred on the node's local origin,
 * spanning `[-extent, -extent] … [+extent, +extent]`.
 */
export class DrawnShapePivot extends ShapeNode<DrawnShapePivotProps> {

    @property({ default: 200 }) declare readonly extent: number;
    @property({ default: 'center' }) declare readonly anchor: AnchorKey;
    @property({ default: { x: 0, y: 0 } }) declare readonly target: Vector2;

    constructor(props: NodeConfig<DrawnShapePivot, DrawnShapePivotProps>) {
        super(props);
        // Self-sized to the design box; default to hugging it so a bare
        // <DrawnShapePivot /> lays out at its natural size in any container.
        this.applyProp("width", props.width ?? props.extent ?? 200 * 2);
        this.applyProp("height", props.height ?? props.extent ?? 200 * 2);
    }

    protected renderSelf(draw: RenderContext): void {
        const e = this.extent;
        const t = this.target;

        // ── The rect, positioned ONLY by its cardinal anchor ─────────────────
        // No x/y: `{ [anchor]: target }` is the whole positioning. The named
        // corner of this rect should come to rest exactly on `target`.
        const rw = e * 0.8;
        const rh = e * 0.8;
        const figure = new Graphics()
            .rect({ [this.anchor]: t, width: rw, height: rh, cornerRadius: e * 0.1 })
            .fill(this.fill)
            .stroke(this.stroke);

        draw.draw(figure);

        // ── Target marker: a ✕ at the raw target point ───────────────────────
        // Drawn from the same y-up `target`, with no anchor — so it's an
        // independent witness of where the rect's named corner should land.
        const m = e * 0.08;
        const cross = new Graphics()
            .line({ points: [{ x: t.x - m, y: t.y - m }, { x: t.x + m, y: t.y + m }] })
            .line({ points: [{ x: t.x - m, y: t.y + m }, { x: t.x + m, y: t.y - m }] })
            .stroke({ weight: e * 0.03, fill: '#ffffff' });

        draw.draw(cross);

        // A faint ring around the marker so the target reads even over the rect.
        const ring = new Graphics()
            .ellipse({ x: t.x, y: t.y, width: e * 0.22, height: e * 0.22 })
            .stroke({ weight: e * 0.012, fill: Fills.color('#ffffff', { opacity: 0.5 }) });

        draw.draw(ring);
    }
}
