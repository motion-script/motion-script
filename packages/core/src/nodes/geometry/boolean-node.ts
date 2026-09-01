import { RenderContext2D, RenderPass2D } from "@/render/render-context2d";
import { Node2D, NodeConfig  } from "@/nodes/2d/node2d";
import { Graphics2D } from "@/render/graphics2d";

import { ShapeNode, ShapeProps } from "@/nodes/geometry/shape-node";
import { BooleanOperation } from "@/attributes/mask/boolean";
import { BoxBounds } from "@/attributes/layout/bounds";
import { childInkBounds, ChildBoundsMode } from "@/nodes/geometry/group-bounds";
import { FillResolved } from "@/attributes/shape/fill/union";
export interface BooleanGroupProps extends ShapeProps {
    op: BooleanOperation;
}

// Figma-style non-destructive boolean operation node. Children remain
// independently editable; their geometry is combined at render time using
// `op` (union | subtract | intersect | exclude) and the result is filled and
// stroked using the BooleanGroup's own fill / stroke / shadow props.
//
// Children of any depth that produce paths (Rect, Ellipse, Path, nested
// BooleanGroup) contribute. Their own fills/strokes are suppressed during
// the collection phase since only the combined silhouette is drawn.
export class BooleanGroup extends ShapeNode<BooleanGroupProps> {

    declare op: BooleanOperation;

    constructor(props: NodeConfig<BooleanGroup, BooleanGroupProps>) {
        super(props);
        this.applyProp("op", props.op ?? "union");
    }

    // Required by ShapeNode but unused here — renderContent is fully overridden.
    protected renderSelf(ctx: RenderContext2D): void { }

    /**
     * The combined silhouette's extent, not the layout cell — see
     * {@link childInkBounds}, which also explains why the operation decides
     * which children are measured.
     *
     * This node draws nothing of its own: its pixels are its children's,
     * combined. A box round the cell would therefore be a box round nothing, and
     * since `hitTestSelf` falls back to this box too (a boolean group declares
     * no `shapeGraphics`, so there is no outline to hit), it would also be a
     * grab region in the wrong place. One override fixes both.
     */
    override _localBounds(): BoxBounds {
        return childInkBounds(this, boundsModeFor(this.op)) ?? super._localBounds();
    }

    // Children (whose geometry we combine) are stack-laid-out (centered) by
    // the base Node2D.layout default, so child x/y/width behave as authored.

    protected override renderContent(ctx: RenderPass2D): void {
        // Apply only this node's own transform. We deliberately bypass the
        // default body (which would draw the shape and then render children
        // directly) — we want children to feed into the boolean collection
        // instead of drawing themselves. We still run inside the shared effect /
        // clip-path envelope so a BooleanGroup honours `effects` and `clipPath`
        // like any other shape node, banding/warping the combined silhouette.
        this.applyTransform(ctx);
        this.renderContentWithEffects(ctx, () => {
            ctx.beginBoolean(this.op);
            for (const child of this._children) if (child instanceof Node2D) child.render(ctx);
            // endBoolean leaves the combined path as the active surface; paint-only
            // Graphics2D (no shape ops) then style that surface in order. Paint-only
            // Graphics2D don't reset the shape accumulator, so each paints the active
            // boolean silhouette. Order matches every ShapeNode: shadow+fill, then
            // overlay over the fill, then stroke on top.
            ctx.endBoolean();
            ctx.draw(new Graphics2D().shadow(this.shadow).fill(this.fill));
            const overlay = this.overlay as FillResolved[];
            if (overlay.length > 0) ctx.draw(new Graphics2D().fill(overlay));
            ctx.draw(new Graphics2D().stroke(this.stroke));
        });
    }
}

/**
 * Which of the children a given operation's result can reach.
 *
 * `union` and `exclude` both draw from every child, and the union of the parts
 * bounds each exactly. `subtract` can only cut into its first child, and
 * `intersect` lives inside all of them — so both shrink rather than grow. See
 * {@link childInkBounds} for what that costs (a superset, never a box the ink
 * escapes).
 */
function boundsModeFor(op: BooleanOperation): ChildBoundsMode {
    if (op === "subtract") return "first";
    if (op === "intersect") return "intersect";
    return "union";
}
