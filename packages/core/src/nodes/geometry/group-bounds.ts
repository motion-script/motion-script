import { Node2D } from "@/nodes/2d/node2d";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Vector2 } from "@/attributes/layout/vector2";
import { multiply, translation } from "@/attributes/layout/matrix2d";
import { worldAnchors } from "@/nodes/2d/node-transform";

/**
 * The ink extent of a node whose drawing is made **out of its children** rather
 * than out of a box of its own — a {@link BooleanGroup}, a {@link MaskGroup}.
 *
 * Both of those classes report their layout cell as their bounds by default,
 * and for both that cell is a fiction: nothing is drawn at its edges, nothing
 * is grabbable there, and it does not move when the parts inside it do. An
 * editor drawing a selection box around one is drawing a rectangle that has no
 * relationship to the pixels — which is exactly what {@link Node2D._localBounds}
 * exists to fix, and the reason it is a separate seam from `measure()`: the box
 * moves, the layout does not.
 *
 * ## Why an op decides the answer
 *
 * A bounding box is the one thing about a boolean result you *can* work out
 * without running the boolean. For a union it is even exact —
 * `bounds(A ∪ B) = bounds(A) ∪ bounds(B)` — and the same union is the honest
 * answer for `exclude`, whose result is a subset of it and whose parts are all
 * still there to be seen. The other two shrink instead: subtracting can only
 * ever cut into the first child, and an intersection lives inside every child
 * at once. So each mode below states which of those it is, and the result is a
 * *superset* of the true silhouette for `subtract`/`intersect` and exact for
 * the other two — never a box the drawing spills out of, which is the failure
 * that would matter.
 *
 * ## Why this composes with a resize that scales the children
 *
 * The studio resizes one of these nodes by scaling every child about the corner
 * the drag holds still (see `use-canvas-selection`), and that gesture is only
 * coherent if the box it is dragging follows the parts by the same factor. It
 * does, for all three modes: an axis-aligned scale about a point commutes with
 * union and intersection alike, so scaling every child by `k` scales the answer
 * here by exactly `k`. Neither half has to know about the other.
 */
export type ChildBoundsMode =
    /** Every child's ink, together — `union` and `exclude`. */
    | "union"
    /** The first child's ink alone — `subtract`'s base, and a mask's stencil. */
    | "first"
    /** Where every child's ink overlaps — `intersect`. */
    | "intersect";

/** Min/max in the node's own local space, y-up, relative to its centre. */
interface Span {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * The four corners of `child`'s ink, in its **parent's** local space (y-up,
 * relative to the parent's centre).
 *
 * The same two-step `nodeBox` makes: shift the child's matrix onto the ink's own
 * centre (the matrix is canvas y-down and the bounds are y-up, hence the sign),
 * then read the corners off it. That is what makes this correct for a child that
 * is rotated, scaled, or whose ink is off-centre — a `Line`, most of all, whose
 * points are nowhere near its layout cell.
 */
function inkCorners(child: Node2D): Vector2[] {
    const b = child._localBounds();
    const local = child._localMatrix();
    const m =
        b.x === 0 && b.y === 0 ? local : multiply(local, translation(b.x, -b.y));
    const a = worldAnchors(m, b.width / 2, b.height / 2);
    return [a.topLeft, a.topRight, a.bottomRight, a.bottomLeft];
}

/** The axis-aligned span of a point set, or `null` for an empty one. */
function spanOf(points: Vector2[]): Span | null {
    if (points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}

function toBounds(span: Span): BoxBounds {
    return {
        x: (span.minX + span.maxX) / 2,
        y: (span.minY + span.maxY) / 2,
        width: span.maxX - span.minX,
        height: span.maxY - span.minY,
    };
}

/**
 * The extent of `node`'s children's ink in `node`'s own local space, or `null`
 * when there is nothing to measure — no children, or an `intersect` whose parts
 * don't overlap at all.
 *
 * `null` is the caller's cue to keep the layout cell: a node with no children
 * has nothing else to offer, and an empty intersection draws nothing anywhere,
 * so a box round the parts would be a box round a shape that isn't there. The
 * cell at least stays in one place and stays grabbable, which is what a node you
 * need to put another child into has to be.
 */
export function childInkBounds(
    node: Node2D,
    mode: ChildBoundsMode
): BoxBounds | null {
    const children = node.children;
    if (children.length === 0) return null;

    if (mode === "first") {
        const span = spanOf(inkCorners(children[0]));
        return span ? toBounds(span) : null;
    }

    if (mode === "union") {
        const span = spanOf(children.flatMap(inkCorners));
        return span ? toBounds(span) : null;
    }

    let span: Span | null = null;
    for (const child of children) {
        const next = spanOf(inkCorners(child));
        if (!next) return null;
        span = span
            ? {
                  minX: Math.max(span.minX, next.minX),
                  minY: Math.max(span.minY, next.minY),
                  maxX: Math.min(span.maxX, next.maxX),
                  maxY: Math.min(span.maxY, next.maxY),
              }
            : next;
        // The parts have stopped overlapping — nothing is drawn, so there is no
        // box to draw. See the header.
        if (span.minX > span.maxX || span.minY > span.maxY) return null;
    }
    return span ? toBounds(span) : null;
}
