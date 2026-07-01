import { Vector2, lerpVector2 } from "./vector2";

/**
 * Named alignment positions for a Rect's children, following the same
 * vocabulary as the node anchor keys (`center`, `topLeft`, …). Each maps to a
 * per-axis pivot in `[-1, 1]`: x is -1 (left) … +1 (right), y is -1 (bottom) …
 * +1 (top) — the y-up convention used throughout layout.
 */
export type AlignKey =
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
 * Accepted alignment input: a named position (`'center'`) or an explicit
 * per-axis {@link Vector2} pivot in `[-1, 1]`.
 */
export type Alignment = AlignKey | Vector2;

const ALIGN_NAMES: Record<AlignKey, Vector2> = {
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

/** The nine named anchor keys, in a stable order. Shared by node and shape
 * anchor-positioning (mirrors `SHAPE_ANCHOR_KEYS`) so call sites can detect which
 * anchor prop, if any, an author passed. */
export const ALIGN_KEYS = Object.keys(ALIGN_NAMES) as AlignKey[];

/** Resolves an {@link Alignment} into a per-axis pivot {@link Vector2}. */
export function resolveAlign(value: Alignment): Vector2 {
    if (typeof value === "string") {
        const named = ALIGN_NAMES[value];
        if (!named) {
            throw new Error(`Unknown align value: '${value}'`);
        }
        return { ...named };
    }
    return { x: value.x, y: value.y };
}

/**
 * Resolve an {@link Alignment} into a normalised pivot {@link Vector2} (the
 * `[-1, 1]` space used by node and per-shape transforms). A named anchor goes
 * through {@link resolveAlign}; an explicit {@link Vector2} passes through. Alias
 * of {@link resolveAlign} — named so call sites read as pivot resolution.
 */
export const resolvePivot: (value: Alignment) => Vector2 = resolveAlign;

export { lerpVector2 as lerpAlign };
