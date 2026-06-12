import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, PathBuilder,
    FillSpace, property,
} from "@motion-script/core";

export interface DrawnShapeProps extends ShapeProps {
    /**
     * Reference frame the shape's fill resolves against. Forwarded onto every
     * fill layer the node paints, so the same drawn silhouette can be shown
     * under `local` / `parent` / `global` spaces side by side.
     */
    space: FillSpace;
    /** Half-width of the design box the commands are authored in. */
    extent: number;
}

/**
 * A node that paints one complex silhouette *entirely from draw commands*.
 *
 * Rather than composing JSX `Rect`/`Ellipse`/`Path`/`BooleanGroup` nodes, the
 * whole figure is recorded as a single {@link Graphics} command list inside
 * {@link renderSelf}: an outer rounded **rect**, an **ellipse** lobe and a
 * bezier **path** wing are accumulated into one surface, then two holes are
 * punched with `.cut()` (an ellipse eye and a rect slot). Because the shapes
 * are drawn together before a single `.fill()`, the fill resolves across the
 * whole union — making the fill `space` directly observable: one gradient maps
 * over the figure's own bounds (`local`), or against the parent rect (`parent`)
 * or the viewport (`global`).
 *
 * All coordinates are authored in a box centred on the node's local origin,
 * spanning `[-extent, -extent] … [+extent, +extent]`. Paths are given that same
 * box as `centerBounds` so every command shares one frame instead of each path
 * self-centering on its own bbox.
 */
export class DrawnShape extends ShapeNode<DrawnShapeProps> {

    @property({ default: 'local' }) declare readonly space: FillSpace;
    @property({ default: 320 }) declare readonly extent: number;

    constructor(props: NodeConfig<DrawnShape, DrawnShapeProps>) {
        super(props);
        // The figure is self-sized to the design box; default to hugging it so a
        // bare <DrawnShape /> lays out at its natural size in any container.
        this.applyProp("width", props.width ?? props.extent ?? 320 * 2);
        this.applyProp("height", props.height ?? props.extent ?? 320 * 2);
    }

    /** Tag every fill layer with this node's `space` so the silhouette honours it. */
    private spacedFill() {
        const space = this.space;
        return this.fill.map(fill =>
            typeof fill === 'string' ? { type: 'color' as const, color: fill, space } : { ...fill, space },
        );
    }

    protected renderSelf(draw: RenderContext): void {
        const e = this.extent;
        // Shared frame for the path commands so they sit in the same centred box
        // as the rect/ellipse offsets rather than self-centering on their bbox.
        const frame: [number, number, number, number] = [-e, -e, e, e];

        // The wing: a closed bezier blob to the right, authored in the centred frame.
        const wing = new PathBuilder()
            .moveTo(e * 0.1, -e * 0.55)
            .bezierCurveTo(e * 0.95, -e * 0.7, e * 1.0, e * 0.2, e * 0.35, e * 0.7)
            .bezierCurveTo(e * 0.2, e * 0.45, e * 0.2, e * 0.0, e * 0.1, -e * 0.55)
            .close();

        const g = new Graphics()
            // ── Solid body, accumulated as one surface ───────────────────────
            // Outer rounded rect — the main mass.
            .rect({ x: -e * 0.15, y: 0, width: e * 1.1, height: e * 1.5, borderRadius: e * 0.28 })
            // Ellipse lobe — a head bulging off the top-left.
            .ellipse({ x: -e * 0.45, y: -e * 0.55, width: e * 0.9, height: e * 0.9 })
            // Bezier wing path, sharing the body's frame.
            .path(wing.toPathState({ centerBounds: frame }))
            // ── Holes ────────────────────────────────────────────────────────
            // Eye hole: an ellipse drawn then cut from everything before it.
            .ellipse({ x: -e * 0.45, y: -e * 0.55, width: e * 0.3, height: e * 0.3 })
            .cut()
            // Slot hole: a rounded rect notch cut lower in the body.
            .rect({ x: -e * 0.15, y: e * 0.45, width: e * 0.55, height: e * 0.18, borderRadius: e * 0.09 })
            .cut()
            // ── Paint the whole union with the space-tagged fill ─────────────
            .shadow(this.shadow)
            .fill(this.spacedFill())
            .stroke(this.stroke);

        draw.draw(g);
    }
}
