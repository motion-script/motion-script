import { RenderContext } from "@/render/render-context";
import { Node, NodeConfig, NodeProps } from "./node";
import { MaskMode } from "@/attributes/mask/mask";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import { layoutGroupChildren } from "@/layout/group-layout";

export interface MaskGroupProps extends NodeProps {
    // How the mask shape determines content visibility:
    //   "alpha"     — mask alpha drives content alpha (default; matches Figma)
    //   "vector"    — fast hard clip using the mask's outline only
    //   "luminance" — mask brightness drives content alpha
    mode: MaskMode;
    // When true, content shows where the mask is *not* (Figma's "subtract" mask).
    inverted: boolean;
}

// Figma-style mask container. The first child is treated as the mask shape;
// remaining children are content clipped by it. Switch `mode` between
// "alpha" (full alpha mask), "vector" (path-only clip; fastest), and
// "luminance" (mask brightness drives visibility). `inverted` flips the mask
// to subtract mode.
//
// If there is only a single child, it renders normally (a single child with
// no content to mask is a no-op aside from drawing the child itself).
export class MaskGroup extends Node<MaskGroupProps> {

    declare mode: MaskMode;
    declare inverted: boolean;

    constructor(props: NodeConfig<MaskGroup, MaskGroupProps>) {
        super(props);
        this.applyProp("mode", props.mode ?? "alpha");
        this.applyProp("inverted", props.inverted ?? false);
    }

    // The base Node only lays out itself; mask + content children need a layout
    // pass too, or they render at zero size. Lay them out stack-style (centered).
    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);
        layoutGroupChildren(this._children, rect, scope);
    }

    onRender(ctx: RenderContext): void {
        // Apply own transform. Children's spaces are nested inside this.
        // Children are rendered through the mask scope below, not by the base.
        this.applyTransform(ctx);

        if (this._children.length === 0) return;

        const [mask, ...content] = this._children;

        if (content.length === 0) {
            // Nothing to clip — render the mask child as-is so authors can
            // wire up the tree before adding content.
            mask.render(ctx);
            return;
        }

        ctx.beginMask({ mode: this.mode, inverted: this.inverted });
        mask.render(ctx);
        ctx.applyMask();
        for (const child of content) child.render(ctx);
        ctx.endMask();
    }
}
