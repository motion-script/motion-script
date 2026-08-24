import { Vector2 } from "@/attributes/layout/vector2";
import {
    Matrix2D,
    NO_PROJECTION_3D,
    applyToPoint,
    nodeProjectedMatrix,
    type Projection3D,
} from "@/attributes/layout/matrix2d";

/**
 * Companion for {@link Node2D}'s transform/anchor/world-space math. The reactive
 * prop reads (x/y/rotation/scale/pivot/layoutBounds) and the parent-chain walk
 * stay in Node2D's getters; the pure geometry lives here. Reuses the matrix
 * primitives in `attributes/layout/matrix2d.ts`.
 */

/**
 * Rotate a centered offset `(ox, oy)` (y-up) by `rotationDeg` (clockwise) and
 * translate by the node's `(x, y)`, giving a parent-relative anchor point. Fast
 * path for the un-rotated case. Drives the local anchor getters.
 */
/** @internal */
export function rotateOffset(x: number, y: number, rotationDeg: number, ox: number, oy: number): Vector2 {
    if (rotationDeg === 0) return { x: x + ox, y: y + oy };
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Canvas rotation is clockwise; in y-up space that means
    // x' = cos*ox + sin*oy, y' = -sin*ox + cos*oy.
    return {
        x: x + cos * ox + sin * oy,
        y: y - sin * ox + cos * oy,
    };
}

/**
 * This node's local transform in canvas (y-down) space, matching the matrix the
 * renderer pushes in `applyTransform`. `cx`/`cy` are the positioned centre
 * (`layoutBounds + x`, `layoutBounds - y`); `pivot` is the resolved normalised pivot.
 *
 * `projection` carries the out-of-plane half (mirrors, tilt, depth, perspective)
 * and defaults to none, in which case this is the plain six-number affine matrix
 * it has always been.
 *
 * Both consumers of a node's transform go through here — `Node2D._localMatrix`
 * (and so `worldMatrix`, `global`, and picking) and `Node2D.applyTransform` (and so
 * the renderer) — so there is one definition of the arithmetic rather than two
 * that agree by inspection. They differ in exactly one argument: the renderer
 * passes the projection and the geometry does not, because the mirrors and the
 * tilt are paint rather than shape. See `Node2D._localMatrix`.
 */
/** @internal */
export function localMatrix(
    cx: number,
    cy: number,
    rotation: number,
    scale: number,
    pivot: Vector2,
    width: number,
    height: number,
    projection: Projection3D = NO_PROJECTION_3D,
): Matrix2D {
    const pivotX = pivot.x * (width / 2);
    const pivotY = -pivot.y * (height / 2);
    return nodeProjectedMatrix(cx, cy, rotation, scale, pivotX, pivotY, projection);
}

/** The nine world-space anchor points produced by mapping centered y-up offsets through `m`. */
/** @internal */
export interface WorldAnchors {
    center: Vector2;
    topLeft: Vector2;
    topRight: Vector2;
    bottomLeft: Vector2;
    bottomRight: Vector2;
    topCenter: Vector2;
    bottomCenter: Vector2;
    centerLeft: Vector2;
    centerRight: Vector2;
}

/**
 * Map this node's centered y-up offsets through the world matrix `m`, returning
 * the nine world-space anchor points (y-up). The matrix works in canvas (y-down)
 * space, so y is flipped in and back out. `halfW`/`halfH` are half the node's
 * layout size.
 */
/** @internal */
export function worldAnchors(m: Matrix2D, halfW: number, halfH: number): WorldAnchors {
    const at = (ox: number, oy: number): Vector2 => {
        const p = applyToPoint(m, { x: ox, y: -oy });
        return { x: p.x, y: -p.y };
    };
    return {
        center: at(0, 0),
        topLeft: at(-halfW, halfH),
        topRight: at(halfW, halfH),
        bottomLeft: at(-halfW, -halfH),
        bottomRight: at(halfW, -halfH),
        topCenter: at(0, halfH),
        bottomCenter: at(0, -halfH),
        centerLeft: at(-halfW, 0),
        centerRight: at(halfW, 0),
    };
}
