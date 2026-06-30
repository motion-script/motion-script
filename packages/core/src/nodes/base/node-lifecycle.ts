import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import type { Node, NodeProps } from "./node";

/**
 * Companion for {@link Node}'s animated child-management methods. The sync
 * variants (addChild/removeChild/addChildren/clearChildren/addChildAt/
 * removeChildAt) stay inline on Node — each is a 3–5 line method that mutates
 * `_children`/`_parent` and calls `bindAssets`/`bindChildContext`, so there is
 * no body worth moving. These are the animated overloads, which are meaty enough
 * that they read better out of the class body.
 */

/**
 * Animated `addChildAt`: fade+size the child in after inserting it at `index`.
 * Matches the sync overload signature; called by the overload dispatcher when a
 * duration is provided.
 */
export function* addChildAtAnimated(
    parent: Node,
    child: Node,
    index: number,
    duration: number,
    easing?: EasingFunction,
): FrameGenerator {
    const targetOpacity = child.opacity;
    const isNumericW = typeof child.width === "number";
    const isNumericH = typeof child.height === "number";
    const targetW = isNumericW ? (child.width as number) : 0;
    const targetH = isNumericH ? (child.height as number) : 0;

    child.set({
        opacity: 0,
        ...(isNumericW ? { width: 0 } : {}),
        ...(isNumericH ? { height: 0 } : {}),
    } as Partial<NodeProps>);

    parent.addChildAt(child, index);

    const toProps: Partial<NodeProps> = { opacity: targetOpacity };
    if (isNumericW) toProps.width = targetW;
    if (isNumericH) toProps.height = targetH;
    yield* child.to(toProps as Partial<NodeProps>, duration, easing);
}

/**
 * Animated `removeChildAt`: fade+size the child out, then remove it.
 * Matches the sync overload signature; called by the overload dispatcher when a
 * duration is provided.
 */
export function* removeChildAtAnimated(
    parent: Node,
    index: number,
    duration: number,
    easing?: EasingFunction,
): FrameGenerator {
    if (index < 0 || index >= parent.children.length) return;
    const child = parent.children[index];

    // Pin to current rendered size so the shrink reflows siblings in the parent layout.
    const lw = child.measuredWidth;
    const lh = child.measuredHeight;
    child.set({ width: lw, height: lh } as Partial<NodeProps>);

    yield* child.to({ opacity: 0, width: 0, height: 0 } as Partial<NodeProps>, duration, easing);

    parent.removeChildAt(index);
}

/**
 * Animated `reparent`: fade+size the node out of its current parent, then
 * reparent it and fade+size it in. Matches the sync overload signature.
 */
export function* reparentAnimated(
    node: Node,
    newParent: Node,
    duration: number,
    easing?: EasingFunction,
): FrameGenerator {
    const half = duration / 2;
    const targetOpacity = node.opacity;

    // Pin to current rendered size so exit shrink reflows the old parent.
    const lw = node.measuredWidth;
    const lh = node.measuredHeight;
    node.set({ width: lw, height: lh } as Partial<NodeProps>);

    yield* node.to({ opacity: 0, width: 0, height: 0 } as Partial<NodeProps>, half, easing);

    const old = node.parent;
    if (old) old.removeChild(node);
    newParent.addChild(node);

    yield* node.to({ opacity: targetOpacity, width: lw, height: lh } as Partial<NodeProps>, half, easing);
}
