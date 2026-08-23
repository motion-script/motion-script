import { ANCHOR_KEYS, resolveAnchor, type AnchorKey } from "./anchor";
import { BoxBounds } from "./bounds";
import { Vector2 } from "./vector2";

/**
 * Shared anchor-positioning math for {@link Node2D}, used by both the constructor
 * (reactive binding form) and a `to()` step (one-shot form).
 *
 * A named anchor (`'topRight'`, `'centerLeft'`, …) resolves to a normalised
 * pivot `a` in `[-1, 1]` (y-up). To land that anchor on a target scene-space
 * point, the node's centre must sit at `target - a·(size/2)` — the inverse of
 * the offset from centre to the anchor. This file is the single source of that
 * formula; previously it was duplicated between `Node2D`'s constructor and
 * `_prepareStep`.
 */

/**
 * Validate a node's anchor-positioning props: at most one named anchor, and an
 * anchor cannot be combined with an explicit `pivot` (the anchor derives one).
 */
/** @internal */
export function validateAnchorProps(props: Record<string, unknown>): void {
    const presentAnchors = ANCHOR_KEYS.filter(k => props[k] !== undefined);
    if (presentAnchors.length > 1) {
        throw new Error(`Cannot set multiple anchor props at once: ${presentAnchors.join(', ')}`);
    }
    if (presentAnchors.length === 1 && props['pivot'] !== undefined) {
        throw new Error(`Cannot set both anchor prop '${presentAnchors[0]}' and 'pivot' at the same time`);
    }
}

/** @internal The first named anchor key present in `props`, or `undefined` if none. */
export function findAnchorKey(props: Record<string, unknown>): AnchorKey | undefined {
    return ANCHOR_KEYS.find(k => props[k] !== undefined);
}

/**
 * Resolve a named anchor + the centre offset that lands it on `target`, given a
 * concrete layout rect. Used by the one-shot `to()` path: returns the pivot to
 * apply plus the absolute `x`/`y` the node's centre must move to.
 */
/** @internal */
export function resolveAnchorTargetOnce(
    anchorKey: AnchorKey,
    rect: BoxBounds,
    target: Vector2,
): { pivot: Vector2; x: number; y: number } {
    const a = resolveAnchor(anchorKey);
    return {
        pivot: a,
        x: target.x - a.x * (rect.width / 2),
        y: target.y - a.y * (rect.height / 2),
    };
}

/**
 * Build the reactive binding form used by the constructor: given a (possibly
 * dynamic) target accessor and a live layout-rect accessor, returns the pivot
 * to write plus `x`/`y` binding callbacks that re-evaluate whenever the target
 * or the node's layout changes. The caller writes these via its prop machinery.
 */
/** @internal */
export function bindAnchorTarget(
    anchorKey: AnchorKey,
    getTarget: () => Vector2,
    getRect: () => BoxBounds,
): { pivot: Vector2; x: () => number; y: () => number } {
    const a = resolveAnchor(anchorKey);
    return {
        pivot: a,
        x: () => getTarget().x - a.x * (getRect().width / 2),
        y: () => getTarget().y - a.y * (getRect().height / 2),
    };
}
