import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import type { Node, NodeProps } from "./node";

/**
 * Measure `child`'s natural size **without attaching it to `parent`** — so the
 * measurement never perturbs the parent's layout (siblings don't shift for a
 * frame). Uses the constraints + scope the parent retained from its last measure
 * pass; returns `null` if the parent hasn't been measured yet (nothing on screen
 * to reflow against), so the caller can fall back. Reads `parent.constraints`
 * and `parent._lastScope` — internal layout state the lifecycle helpers are the
 * intended in-directory consumer of.
 */
function measureDetached(parent: Node, child: Node): { width: number; height: number } | null {
    const p = parent as unknown as { constraints?: SizeConstraints; _lastScope?: MeasureScope };
    const scope = p._lastScope;
    // The scope (text measurement) is the essential input and is only present once
    // the parent has been laid out; without it we can't size a hug child off-tree.
    if (!scope) return null;
    // The parent's own constraints bound the child; fall back to its laid-out box,
    // then to an unbounded space — a hug child shrink-wraps regardless, so a
    // generous ceiling is fine.
    const constraints: SizeConstraints = p.constraints ?? {
        maxWidth: parent.measuredWidth || Number.MAX_SAFE_INTEGER,
        maxHeight: parent.measuredHeight || Number.MAX_SAFE_INTEGER,
    };
    const size = child.measure(constraints, scope);
    return { width: size.width ?? 0, height: size.height ?? 0 };
}

/**
 * Companion for {@link Node}'s animated child-management methods. The sync
 * variants (addChild/removeChild/addChildren/clearChildren/addChildAt/
 * removeChildAt) stay inline on Node — each is a 3–5 line method that mutates
 * `_children`/`_parent` and calls `bindAssets`/`bindChildContext`, so there is
 * no body worth moving. These are the animated overloads, which are meaty enough
 * that they read better out of the class body.
 */

/**
 * A flex/group container's main axis and its fixed per-gap spacing, as read
 * off an arbitrary `parent` — duck-typed since `Rect`/`RootNode` (`group` +
 * `gap`) and `Row`/`Column` (a `protected direction` + `gap`) expose the same
 * shape under different names, and `node-lifecycle` operates on the generic
 * `Node` base type. Returns `null` when the parent isn't a fixed-gap flex
 * container: no `gap` prop at all, a `"stack"` group (children overlap; gap is
 * unused), or `gap: "auto"` (space is redistributed across the *whole* row on
 * every layout pass rather than added as a fixed per-child amount, so there is
 * no fixed delta to fold into the tween — the existing per-frame layout
 * already redistributes it smoothly).
 */
// function mainAxisGap(parent: Node): { axis: "width" | "height"; gap: number } | null {
//     const p = parent as unknown as { gap?: GapSize; group?: LayoutMode; direction?: FlexDirection };
//     if (typeof p.gap !== "number") return null;
//     const direction = p.group !== undefined
//         ? (p.group === "stack" ? null : p.group)
//         : (p.direction ?? null);
//     if (direction === null) return null;
//     return { axis: direction === "row" ? "width" : "height", gap: p.gap };
// }

/**
 * Animated `addChildAt`: insert the child at `index` **already collapsed to 0**,
 * then grow it in — fading opacity up and expanding its box from 0 → its natural
 * size so the surrounding siblings **slide over to make room** rather than
 * jumping. The mirror of {@link removeChildAtAnimated} (which pins to the
 * measured size and shrinks to 0).
 *
 * A numeric-sized axis has its target size in hand up front. A `"hug"`/`"fill"`
 * axis does not — its size is only known once laid out — so we measure the child
 * **detached** (via {@link measureDetached}, using the parent's retained
 * constraints + scope) *before* attaching it. That keeps the child out of the
 * parent's layout flow while we size it, so the siblings never see it at full
 * width for a frame — no reflow flash. The child is then added at 0 and the tween
 * grows it to that measured size. Because the tween needs *numeric* endpoints
 * (a string size only snaps, it can't interpolate), the original size token is
 * restored at the end so the child resumes normal reflow.
 *
 * If the parent hasn't been measured yet (no retained scope — nothing is on
 * screen to reflow against), a non-numeric axis simply can't be pre-measured;
 * it falls back to its authored token and fades in without a width tween.
 *
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
    // Remember the authored size tokens so a hug/fill axis can be restored after
    // the numeric grow-in tween finishes.
    const origW = child.width;
    const origH = child.height;
    const isNumericW = typeof origW === "number";
    const isNumericH = typeof origH === "number";

    // Pre-measure any non-numeric axis while the child is still detached, so
    // sizing it can't shift the parent's existing children for a frame.
    const detached = isNumericW && isNumericH ? null : measureDetached(parent, child);

    // Resolve each axis' grow-to target: a numeric axis uses its authored size; a
    // hug/fill axis uses the detached measurement (or gives up the width tween if
    // the parent isn't measured yet).
    const tweenW = isNumericW || detached !== null;
    const tweenH = isNumericH || detached !== null;
    const targetW = isNumericW ? (origW as number) : (detached?.width ?? 0);
    const targetH = isNumericH ? (origH as number) : (detached?.height ?? 0);

    // Collapse the axes we can tween to 0 before inserting, so the child enters
    // taking no room and the siblings hold their positions.
    child.set({
        opacity: 0,
        ...(tweenW ? { width: 0 } : {}),
        ...(tweenH ? { height: 0 } : {}),
    } as Partial<NodeProps>);
    parent.addChildAt(child, index);

    const toProps: Partial<NodeProps> = { opacity: targetOpacity };
    if (tweenW) toProps.width = targetW;
    if (tweenH) toProps.height = targetH;
    yield* child.to(toProps as Partial<NodeProps>, duration, easing);

    // Restore any hug/fill token so the child reflows naturally from here on; the
    // tween already landed the axis on its measured pixel size, so this is seamless.
    const restore: Partial<NodeProps> = {};
    if (!isNumericW) restore.width = origW;
    if (!isNumericH) restore.height = origH;
    if (!isNumericW || !isNumericH) child.set(restore as Partial<NodeProps>);
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
