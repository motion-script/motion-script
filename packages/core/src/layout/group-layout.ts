import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";
import type { Node } from "@/nodes/base/node";

/**
 * Stack-layout a container's children, centered within its box.
 *
 * Container nodes that aren't a {@link Rect} (e.g. MaskGroup, BooleanGroup)
 * don't run flex/stack layout themselves, so without this their children never
 * receive a layout pass and render at zero size. This gives each child a
 * `BoxBounds` centered in the container (origin = container center, matching the
 * `Rect` "stack" convention), sized to the child's own measured size and capped
 * to the container. Children then offset from center via their own `x`/`y`.
 */
export function layoutGroupChildren(children: Node[], rect: BoxBounds, scope: MeasureScope): void {
    const constraints = { maxWidth: rect.width, maxHeight: rect.height };
    for (const child of children) {
        const size = child.measure(constraints, scope);
        child.layout(
            {
                x: 0,
                y: 0,
                width: size.width ?? 0,
                height: size.height ?? 0,
            },
            scope,
        );
    }
}
