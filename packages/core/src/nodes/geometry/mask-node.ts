import { RenderPass2D } from "@/render/render-context2d";
import { MaskMode } from "@/attributes/mask/mask";
import { Node2DProps, Node2D, NodeConfig } from "@/nodes/2d/node2d";
import { BoxBounds } from "@/attributes/layout/bounds";
import { childInkBounds } from "@/nodes/geometry/group-bounds";

export interface MaskGroupProps extends Node2DProps {
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
export class MaskGroup extends Node2D<MaskGroupProps> {

    declare mode: MaskMode;
    declare inverted: boolean;

    constructor(props: NodeConfig<MaskGroup, MaskGroupProps>) {
        super(props);
        this.applyProp("mode", props.mode ?? "alpha");
        this.applyProp("inverted", props.inverted ?? false);
    }

    /**
     * The **stencil's** extent, not the layout cell — the first child's ink, via
     * {@link childInkBounds}.
     *
     * A mask shows some of what was already there, and the "some" is exactly the
     * mask child: content reaching past it is cut off and content falling short
     * of it simply isn't drawn there. So the mask's own outline is the honest
     * answer to both "where are this node's pixels" (the selection box) and
     * "where can it be grabbed" (`hitTestSelf` falls back to this box, since a
     * MaskGroup declares no outline of its own) — where the cell it lays out in
     * is the answer to neither.
     *
     * The stencil itself is invisible by construction, which is what makes this
     * matter more here than on a boolean: without it the one child that decides
     * what the node looks like is the one child nothing on the canvas points at.
     */
    override _localBounds(): BoxBounds {
        return childInkBounds(this, "first") ?? super._localBounds();
    }

    // Mask + content children are stack-laid-out (centered) by the base
    // Node2D.layout default — no override needed here.

    protected override renderContent(ctx: RenderPass2D): void {
        // Apply own transform. Children's spaces are nested inside this.
        // Children are rendered through the mask scope below, not by the base.
        this.applyTransform(ctx);

        if (this._children.length === 0) return;

        // Run the mask through the shared effect / clip-path envelope so a
        // MaskGroup honours `effects` and `clipPath` like any other node — the
        // foreground shader effects warp/band the masked result as one.
        this.renderContentWithEffects(ctx, () => {
            const [mask, ...content] = this.children;

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
        });
    }
}
