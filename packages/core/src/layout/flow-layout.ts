import { BoxBounds } from "@/attributes/layout/bounds";
import { InsetsResolved } from "@/attributes/layout/insets";
import { Measurer } from "@/render/measurer";
import type { Node } from "@/nodes/base/node";

const NO_PADDING: InsetsResolved = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Freeform-layout a container's children, centered within its padded box.
 *
 * Container nodes that aren't a {@link Rect} (e.g. MaskGroup, BooleanGroup) and
 * every plain {@link Node} / {@link ShapeNode} leaf don't run flex/freeform layout
 * themselves, so without this their children never receive a layout pass and
 * render at zero size. This gives each child a `BoxBounds` centered in the
 * container's content area (origin = container center, matching the `Rect`
 * `'freeform'` convention), sized to the child's own measured size and capped to
 * the content area. Padding insets the content area and shifts the centre by the
 * left/right (top/bottom) asymmetry, exactly like `Rect`'s freeform layout, so a
 * padded hug container reserves the same space it measured. Children then offset
 * from centre via their own `x`/`y`.
 *
 * `children` is the container's **flow** children — a stage-pinned child is
 * placed by `Node.layoutAbsoluteChildren` instead and must not be passed here.
 */
export function layoutFlowChildren(
    children: Node[],
    rect: BoxBounds,
    scope: Measurer,
    pad: InsetsResolved = NO_PADDING,
): void {
    const innerW = Math.max(0, rect.width - pad.left - pad.right);
    const innerH = Math.max(0, rect.height - pad.top - pad.bottom);
    const offsetX = (pad.left - pad.right) / 2;
    const offsetY = (pad.top - pad.bottom) / 2;
    const constraints = { maxWidth: innerW, maxHeight: innerH };
    for (const child of children) {
        const size = child.measure(constraints, scope);
        child.layout(
            {
                x: offsetX,
                y: offsetY,
                width: size.width ?? 0,
                height: size.height ?? 0,
            },
            scope,
        );
    }
}
