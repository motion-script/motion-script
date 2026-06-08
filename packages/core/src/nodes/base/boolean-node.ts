import { RenderContext } from "@/render/render-context";

import { NodeConfig } from "./node";
import { ShapeNode, ShapeProps } from "@/nodes/geometry/shape-node";
import { BooleanOperation } from "@/attributes/mask/boolean";
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

    onRender(ctx: RenderContext): void {
        // Apply only this node's own transform. We deliberately bypass
        // ShapeNode's onRender (which would draw the shape and then render
        // children directly) — we want children to feed into the boolean
        // collection instead of drawing themselves.
        this.applyTransform(ctx);

        ctx.beginBoolean(this.op);
        for (const child of this._children) child.render(ctx);
        // endBoolean leaves the combined path as the active shape so the
        // chained shadow / fill / stroke calls below paint it.
        ctx.endBoolean()
            .shadow(this.shadow)
            .fill(this.fill)
            .stroke(this.stroke);
    }
}
