import { Vector2, lerpVector2 } from "./vector2";

/**
 * Named positions inside a box: the nine anchor keys (`center`, `topLeft`, …).
 * Each maps to a per-axis point in `[-1, 1]`: x is -1 (left) … +1 (right), y is
 * -1 (bottom) … +1 (top) — the y-up convention used throughout layout.
 */
export type AnchorKey =
    | "center"
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight"
    | "topCenter"
    | "bottomCenter"
    | "centerLeft"
    | "centerRight";

/**
 * A normalised point inside a box — the single value type behind every "which
 * point of this thing" prop: `Node2D.pivot` (what it rotates about), a container's
 * `align` (where children sit), a gradient's `center` (where it emits from) and
 * an image fill's `anchor` (which point of the source meets the box).
 *
 * Those props keep distinct names because they anchor *different things*; what
 * they share is this type, this `[-1, 1]` y-up space, and this vocabulary — so a
 * value read off one can be handed to another and mean the same place.
 *
 * Accepts a named position (`'center'`) or an explicit {@link Vector2}.
 */
export type Anchor = AnchorKey | Vector2;

const ANCHOR_NAMES: Record<AnchorKey, Vector2> = {
    topLeft: { x: -1, y: 1 },
    topCenter: { x: 0, y: 1 },
    topRight: { x: 1, y: 1 },
    centerLeft: { x: -1, y: 0 },
    center: { x: 0, y: 0 },
    centerRight: { x: 1, y: 0 },
    bottomLeft: { x: -1, y: -1 },
    bottomCenter: { x: 0, y: -1 },
    bottomRight: { x: 1, y: -1 },
};

/** The nine named anchor keys, in a stable order. Shared by node and per-shape
 * anchor-positioning (mirrors `SHAPE_ANCHOR_KEYS`) so call sites can detect which
 * anchor prop, if any, an author passed. */
export const ANCHOR_KEYS = Object.keys(ANCHOR_NAMES) as AnchorKey[];

/**
 * Resolve an {@link Anchor} into its normalised `[-1, 1]` (y-up) {@link Vector2}.
 * A named key looks up the table; an explicit vector passes through, which also
 * makes the function idempotent — a resolved value can be re-resolved.
 *
 * One function, one name: `pivot`, `align`, `center` and `anchor` props all go
 * through it, so there is a single definition of where `'topRight'` is.
 */
export function resolveAnchor(value: Anchor): Vector2 {
    if (typeof value === "string") {
        const named = ANCHOR_NAMES[value];
        if (!named) {
            throw new Error(`Unknown anchor value: '${value}'`);
        }
        return { ...named };
    }
    return { x: value.x, y: value.y };
}

export { lerpVector2 as lerpAnchor };
