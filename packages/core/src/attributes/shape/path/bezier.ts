import { Vector2, lerpVector2 } from "@/attributes/layout/vector2";
import { PathCommand } from "@/render/descriptors/path";

/**
 * Shared Bézier and path-geometry primitives.
 *
 * These helpers are consumed by {@link calculatePathLength}, {@link applyDashPattern},
 * and {@link extractSubpath}. Keeping the math in one place avoids three slightly
 * different copies of the same formulas drifting apart over time.
 *
 * Two evaluation styles are provided:
 *  - Scalar (`cubicAxis` / `quadAxis`) — evaluate a single axis. Cheaper when you
 *    already have loose x/y numbers and want to avoid allocating a {@link Vector2}.
 *  - Vector (`cubicPoint` / `quadPoint`) — evaluate both axes into a {@link Vector2}.
 */

/** SVG curve commands whose tangent feeds the reflected control point of a following S/s/T/t. */
const SMOOTH_CURVE_TYPES: ReadonlySet<PathCommand["type"]> = new Set([
    "C", "c", "S", "s", "Q", "q", "T", "t",
]);

/**
 * True when a command's trailing control point should be remembered so the next
 * smooth command (S/s/T/t) can reflect it. Per the SVG spec, if the previous
 * command was not one of these, the implied control point is the current point.
 */
export function isSmoothCurveType(type: PathCommand["type"]): boolean {
    return SMOOTH_CURVE_TYPES.has(type);
}

/** Reflect a control point through the current point: `2 * current - control`. */
export function reflectControlPoint(current: number, control: number): number {
    return 2 * current - control;
}

/** Euclidean distance between two points. */
export function distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Evaluate one axis of a cubic Bézier at parameter `t` (0..1). */
export function cubicAxis(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Evaluate one axis of a quadratic Bézier at parameter `t` (0..1). */
export function quadAxis(t: number, p0: number, p1: number, p2: number): number {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

/** Evaluate a cubic Bézier at parameter `t` (0..1) into a {@link Vector2}. */
export function cubicPoint(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
    return {
        x: cubicAxis(t, p0.x, p1.x, p2.x, p3.x),
        y: cubicAxis(t, p0.y, p1.y, p2.y, p3.y),
    };
}

/** Evaluate a quadratic Bézier at parameter `t` (0..1) into a {@link Vector2}. */
export function quadPoint(p0: Vector2, p1: Vector2, p2: Vector2, t: number): Vector2 {
    return {
        x: quadAxis(t, p0.x, p1.x, p2.x),
        y: quadAxis(t, p0.y, p1.y, p2.y),
    };
}

/**
 * Approximate the arc length of a parametric curve by sampling it into a polyline
 * and summing the segment distances. More `steps` trade speed for accuracy.
 */
export function sampleCurveLength(pointAt: (t: number) => Vector2, steps = 32): number {
    let length = 0;
    let prev = pointAt(0);
    for (let i = 1; i <= steps; i++) {
        const next = pointAt(i / steps);
        length += distance(prev, next);
        prev = next;
    }
    return length;
}

/** Re-exported so curve math and point lerping live behind a single import. */
export { lerpVector2 };
