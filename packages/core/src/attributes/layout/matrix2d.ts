import { Vector2 } from "@/attributes/layout/vector2";

/**
 * A 2D affine transform stored as the six members of a 3×3 matrix's top two
 * rows (the last row is always `[0 0 1]`):
 *
 * ```
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 * ```
 *
 * Point mapping is `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. This is the same
 * column-order convention CanvasKit/DOM use, so matrices compose in draw order:
 * `parent.multiply(child)` is the world transform of `child`.
 */
/** @internal */
export interface Matrix2D {
    a: number; b: number; c: number; d: number; e: number; f: number;
}

/** @internal The identity transform — maps every point to itself. */
export function identity(): Matrix2D {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** @internal Pure translation by (tx, ty). */
export function translation(tx: number, ty: number): Matrix2D {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

/**
 * `m1 · m2` — the transform that applies `m2` first, then `m1`. Composing an
 * ancestor with a descendant (`ancestor.multiply(descendant)`) yields the
 * descendant's world transform.
 */
/** @internal */
export function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
    return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d,
        e: m1.a * m2.e + m1.c * m2.f + m1.e,
        f: m1.b * m2.e + m1.d * m2.f + m1.f,
    };
}

/** @internal Map a point through the transform. */
export function applyToPoint(m: Matrix2D, p: Vector2): Vector2 {
    return {
        x: m.a * p.x + m.c * p.y + m.e,
        y: m.b * p.x + m.d * p.y + m.f,
    };
}

/**
 * Build the local transform for a node, matching the renderer's
 * `RenderContext.transform` exactly (canvas y-down space):
 * `T(cx + pivotX, cy + pivotY) · R(deg) · S(scale) · T(-pivotX, -pivotY)`.
 *
 * @param cx       Canvas-space x of the node's layout-cell origin.
 * @param cy       Canvas-space y of the node's layout-cell origin (y-down).
 * @param rotation Rotation in degrees, clockwise (canvas convention).
 * @param scale    Uniform scale factor.
 * @param pivotX   Pivot offset in pixels, x.
 * @param pivotY   Pivot offset in pixels, y (canvas y-down).
 */
/** @internal */
export function nodeLocalMatrix(
    cx: number, cy: number, rotation: number, scale: number, pivotX: number, pivotY: number,
): Matrix2D {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // R(deg) · S(scale): clockwise rotation in canvas (y-down) is
    // | cos -sin | · | s 0 | = | s·cos -s·sin |
    // | sin  cos |   | 0 s |   | s·sin  s·cos |
    const a = scale * cos;
    const b = scale * sin;
    const c = scale * -sin;
    const d = scale * cos;
    // Fold the pivot translations into e/f:
    // T(cx+pivotX, cy+pivotY) · (RS) · T(-pivotX, -pivotY)
    return {
        a, b, c, d,
        e: cx + pivotX - (a * pivotX + c * pivotY),
        f: cy + pivotY - (b * pivotX + d * pivotY),
    };
}
