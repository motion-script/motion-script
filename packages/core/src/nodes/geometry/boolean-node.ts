import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";

import { ShapeNode, ShapeProps } from "@/nodes/geometry/shape-node";
import { BooleanOperation } from "@/attributes/mask/boolean";
import { FillResolved } from "@/attributes/shape/fill/union";
import { NodeConfig } from "../base/node";
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

    // Required by ShapeNode but unused here — onRender is fully overridden.
    protected renderSelf(_ctx: RenderContext): void { }

    // Children (whose geometry we combine) are stack-laid-out (centered) by
    // the base Node.layout default, so child x/y/width behave as authored.

    onRender(ctx: RenderContext): void {
        // Apply only this node's own transform. We deliberately bypass the
        // default body (which would draw the shape and then render children
        // directly) — we want children to feed into the boolean collection
        // instead of drawing themselves. We still run inside the shared effect /
        // clip-path envelope so a BooleanGroup honours `effects` and `clipPath`
        // like any other shape node, banding/warping the combined silhouette.
        this.applyTransform(ctx);
        this.renderContentWithEffects(ctx, () => {
            ctx.beginBoolean(this.op);
            for (const child of this._children) child.render(ctx);
            // endBoolean leaves the combined path as the active surface; paint-only
            // Graphics (no shape ops) then style that surface in order. Paint-only
            // Graphics don't reset the shape accumulator, so each paints the active
            // boolean silhouette. Order matches every ShapeNode: shadow+fill, then
            // overlay over the fill, then stroke on top.
            ctx.endBoolean();
            ctx.draw(new Graphics().shadow(this.shadow).fill(this.fill));
            const overlay = this.overlay as FillResolved[];
            if (overlay.length > 0) ctx.draw(new Graphics().fill(overlay));
            ctx.draw(new Graphics().stroke(this.stroke));
        });
    }
}
