import { Vector2, lerpVector2 } from "./vector2";

/**
 * Named alignment positions for a Rect's children, following the same
 * vocabulary as the node anchor keys (`center`, `topLeft`, …). Each maps to a
 * per-axis pivot in `[-1, 1]`: x is -1 (left) … +1 (right), y is -1 (bottom) …
 * +1 (top) — the y-up convention used throughout layout.
 */
export type AlignName =
    | "center"
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight"
    | "topCenter"
    | "bottomCenter"
    | "leftCenter"
    | "rightCenter";

/**
 * Accepted alignment input for a Rect: a named position (`'center'`) or an
 * explicit per-axis {@link Vector2} pivot in `[-1, 1]`.
 */
export type AlignInput = AlignName | Vector2;

const ALIGN_NAMES: Record<AlignName, Vector2> = {
    topLeft: { x: -1, y: 1 },
    topCenter: { x: 0, y: 1 },
    topRight: { x: 1, y: 1 },
    leftCenter: { x: -1, y: 0 },
    center: { x: 0, y: 0 },
    rightCenter: { x: 1, y: 0 },
    bottomLeft: { x: -1, y: -1 },
    bottomCenter: { x: 0, y: -1 },
    bottomRight: { x: 1, y: -1 },
};

/** Resolves an {@link AlignInput} into a per-axis pivot {@link Vector2}. */
export function resolveAlign(value: AlignInput): Vector2 {
    if (typeof value === "string") {
        const named = ALIGN_NAMES[value];
        if (!named) {
            throw new Error(`Unknown align value: '${value}'`);
        }
        return { ...named };
    }
    return { x: value.x, y: value.y };
}

export { lerpVector2 as lerpAlign };
