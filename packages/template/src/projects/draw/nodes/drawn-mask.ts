import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, PathBuilder,
    property,
} from "@motion-script/core";

export interface DrawnMaskProps extends ShapeProps {
    /** Half-width of the design box the commands are authored in. */
    extent: number;
    /** How far the diagonal content stripes are shifted; animate for motion. */
    offset: number;
}

/**
 * A node that builds a Figma-style mask *inline from draw commands*.
 *
 * Within one {@link Graphics} list it opens a mask scope with `.mask()`, draws
 * the complex silhouette (rect + ellipse + bezier path, with a `.cut()` hole)
 * as the **mask**, calls `.applyMask()`, then draws the **content** — a band of
 * coloured diagonal stripes — and closes with `.endMask()`. Only the content
 * under the drawn silhouette survives, so the stripes are clipped to the figure
 * (and the hole shows through). Animating {@link offset} slides the stripes
 * under the static mask, proving the mask is a live draw-command scope.
 */
export class DrawnMask extends ShapeNode<DrawnMaskProps> {

    @property({ default: 320 }) declare readonly extent: number;
    @property({ default: 0 }) declare readonly offset: number;

    constructor(props: NodeConfig<DrawnMask, DrawnMaskProps>) {
        super(props);
        this.applyProp("width", props.width ?? props.extent ?? 320 * 2);
        this.applyProp("height", props.height ?? props.extent ?? 320 * 2);
    }

    protected renderSelf(draw: RenderContext): void {
        const e = this.extent;
        const frame: [number, number, number, number] = [-e, -e, e, e];

        const wing = new PathBuilder()
            .moveTo(e * 0.1, -e * 0.55)
            .bezierCurveTo(e * 0.95, -e * 0.7, e * 1.0, e * 0.2, e * 0.35, e * 0.7)
            .bezierCurveTo(e * 0.2, e * 0.45, e * 0.2, e * 0.0, e * 0.1, -e * 0.55)
            .close();

        const g = new Graphics().mask({ mode: 'alpha' });

        // ── Mask: the complex drawn silhouette (same figure as DrawnShape) ────
        g.rect({ x: -e * 0.15, y: 0, width: e * 1.1, height: e * 1.5, borderRadius: e * 0.28 })
            .ellipse({ x: -e * 0.45, y: -e * 0.55, width: e * 0.9, height: e * 0.9 })
            .path(wing.toPathState({ centerBounds: frame }))
            // Eye hole punched out of the mask, so content shows through it.
            .ellipse({ x: -e * 0.45, y: -e * 0.55, width: e * 0.3, height: e * 0.3 })
            .cut()
            .fill('white');

        g.applyMask();

        // ── Content: diagonal colour stripes that slide under the mask ────────
        // Each stripe is a slanted parallelogram authored directly as a path, so
        // the diagonal lives in the geometry (no per-shape rotation needed).
        const colors = ['#6990DD', '#E8617C', '#F5C26B', '#7ED6A5'];
        const band = e * 0.5;
        const reach = e * 2.4;       // half-height the stripe extends up/down
        const slant = reach * 0.6;   // horizontal lean from bottom to top
        const cycle = band * colors.length;
        const shift = ((this.offset % cycle) + cycle) % cycle;

        for (let i = -8; i <= 8; i++) {
            const c = colors[((i % colors.length) + colors.length) % colors.length];
            const cxb = i * band + shift; // stripe centre x at the bottom edge
            const stripe = new PathBuilder()
                .moveTo(cxb - band * 0.4 + slant, -reach)
                .lineTo(cxb + band * 0.4 + slant, -reach)
                .lineTo(cxb + band * 0.4 - slant, reach)
                .lineTo(cxb - band * 0.4 - slant, reach)
                .close();
            g.path(stripe.toPathState({ centerBounds: frame })).fill(c);
        }

        g.endMask();
        draw.draw(g);
    }
}
