import { Vector2 } from "@/attributes/layout/vector2";
import { Clip, ClipOp, ClipShapeOp } from "./clip";
import { withRectDescriptor } from "./descriptors/rect";
import { withEllipseDescriptor } from "./descriptors/ellipse";
import { withPolygonDescriptor } from "./descriptors/polygon";
import { withPolygramDescriptor } from "./descriptors/polygram";
import { withLineDescriptor } from "./descriptors/line";
import { resolveCornerRadius } from "@/attributes/shape/corners/corner-radius";

/**
 * Point-in-region tests for {@link Clip}, used by node hit testing so a click
 * follows a shape's silhouette rather than its bounding box.
 *
 * Geometry only — no renderer, no CanvasKit — because a `Clip` is a declarative
 * record of primitives rather than a built path. That is what lets hit testing
 * live in `core` and share one outline definition with clipping and backdrop
 * effects: a shape declares its outline once, in `clipSelf()`, and both the
 * pixels and the grab region derive from it.
 *
 * Every point and every descriptor coordinate here is in **y-up author space**
 * (the space `Graphics`/`Clip` descriptors are written in; the renderer flips to
 * canvas y-down at draw time — see `flipPositionY`). Angles follow from that:
 * `startAngle`/`sweep` measure counter-clockwise from +x.
 */

/** Guard against divide-by-zero on collapsed geometry. */
const EPS = 1e-9;

/**
 * Whether `point` falls inside the region a {@link Clip} describes, within
 * `tolerance` scene units of its edge.
 *
 * Shape ops union; a `cut` subtracts the immediately preceding shape from
 * everything declared before it, mirroring how the renderer replays the op list.
 * `tolerance` widens each shape outward — including a cutter, which therefore
 * takes a slightly larger bite, keeping the test forgiving in both directions
 * rather than making a hole's rim unpickable.
 */
export function containsClip(clip: Clip, point: Vector2, tolerance = 0): boolean {
    return containsOps(clip.ops(), point, tolerance);
}

/** {@link containsClip} over a raw op list. */
export function containsOps(ops: readonly ClipOp[], point: Vector2, tolerance = 0): boolean {
    let inside = false;
    // The shape immediately preceding the current position, held back so a
    // following `cut` can subtract it instead of unioning it.
    let pending: ClipShapeOp | null = null;

    const flush = (): void => {
        if (pending && containsShape(pending, point, tolerance)) inside = true;
        pending = null;
    };

    for (const op of ops) {
        if (op.kind === "cut") {
            // The pending shape is the cutter: it never joins the union, and it
            // punches whatever was accumulated before it.
            if (pending && containsShape(pending, point, tolerance)) inside = false;
            pending = null;
            continue;
        }
        flush();
        pending = op;
    }
    flush();
    return inside;
}

/**
 * Dispatch one shape op to its own containment test, after undoing the shape's
 * local rotation/scale about its pivot — mirroring `BaseShape.applyShapeTransform`,
 * which bakes that same transform into the drawn path.
 */
function containsShape(op: ClipShapeOp, point: Vector2, tolerance: number): boolean {
    switch (op.kind) {
        case "rect": {
            const s = withRectDescriptor(op.state);
            const p = toShapeLocal(point, s, s.width, s.height);
            return p !== null && containsRect(p, s.width, s.height, resolveCornerRadius(s.cornerRadius), tolerance);
        }
        case "ellipse": {
            const s = withEllipseDescriptor(op.state);
            const p = toShapeLocal(point, s, s.width, s.height);
            return p !== null && containsEllipse(p, s.width, s.height, s.ratio, s.sweep, s.startAngle, tolerance);
        }
        case "polygon": {
            const s = withPolygonDescriptor(op.state);
            const p = toShapeLocal(point, s, s.width, s.height);
            return p !== null && containsPolyline(p, polygonVertices(s.width, s.height, s.sides), true, tolerance);
        }
        case "polygram": {
            const s = withPolygramDescriptor(op.state);
            const p = toShapeLocal(point, s, s.width, s.height);
            return p !== null && containsPolyline(p, polygramVertices(s.width, s.height, s.sides, s.ratio), true, tolerance);
        }
        case "line": {
            const s = withLineDescriptor(op.state);
            const p = toShapeLocal(point, s, s.width, s.height);
            if (p === null || s.points.length === 0) return false;
            // As a clip region a polyline is filled with its contour implicitly
            // closed, whether or not `closed` was set — so test the enclosed area
            // first, then fall back to the band around the stroke itself.
            if (s.points.length >= 3 && containsPolyline(p, s.points, true, tolerance)) return true;
            return nearPolyline(p, s.points, s.closed, tolerance);
        }
        case "path": {
            // An arbitrary Bézier winding test is not worth carrying, and no
            // built-in shape emits a `path` clip — only a hand-built `Clip` can.
            // Fall back to the declared box.
            const s = op.state;
            const local = { x: point.x - (s.x ?? 0), y: point.y - (s.y ?? 0) };
            return containsRect(local, s.width ?? 0, s.height ?? 0, resolveCornerRadius(0), tolerance);
        }
    }
}

/** The positioning fields every shape descriptor resolves to. */
interface ShapePlacement {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    pivot: unknown;
}

/**
 * Map `point` out of the shape's own `x`/`y`/`rotation`/`scale` (about its
 * pivot) and into the shape's un-transformed, centred frame. Returns `null` when
 * the scale is zero — the shape has collapsed and encloses nothing.
 */
function toShapeLocal(point: Vector2, s: ShapePlacement, width: number, height: number): Vector2 | null {
    if (s.scale === 0) return null;
    const pivot = s.pivot as Vector2;
    // Pivot is normalised [-1, 1] about the shape centre, y-up here (the
    // renderer negates its y because it works in canvas space).
    const px = pivot.x * (width / 2);
    const py = pivot.y * (height / 2);
    // Relative to the pivot, in the parent's (unrotated) frame.
    const dx = point.x - (s.x + px);
    const dy = point.y - (s.y + py);
    // Undo the clockwise rotation: in y-up space the forward map is
    // (cos·x + sin·y, -sin·x + cos·y), so the inverse swaps the sine signs.
    const rad = (s.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = (cos * dx - sin * dy) / s.scale;
    const ry = (sin * dx + cos * dy) / s.scale;
    // Back to centre-relative: the pivot sits (px, py) from the centre.
    return { x: rx + px, y: ry + py };
}

// ─── Primitives ──────────────────────────────────────────────────────────────

interface Corners4 { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }

/**
 * Axis-aligned box centred on the origin, with per-corner rounding. A corner is
 * only excluded when the point sits beyond that corner's quarter-circle, so a
 * plain rect (all radii 0) reduces to the box test exactly. `cornerStyle` is not
 * consulted: an `'angled'` chamfer cuts strictly inside the arc, so testing the
 * arc over-estimates by a sliver — the forgiving direction for a grab test.
 */
function containsRect(p: Vector2, width: number, height: number, radius: Corners4, tolerance: number): boolean {
    const halfW = width / 2 + tolerance;
    const halfH = height / 2 + tolerance;
    if (Math.abs(p.x) > halfW || Math.abs(p.y) > halfH) return false;

    // Pick the corner the point is nearest and test its arc. Radii are clamped
    // the way any rounded-rect rasteriser clamps them: never past half the side.
    const maxR = Math.min(width, height) / 2;
    const r = Math.min(
        maxR,
        p.x <= 0
            ? (p.y >= 0 ? radius.topLeft : radius.bottomLeft)
            : (p.y >= 0 ? radius.topRight : radius.bottomRight),
    );
    if (r <= 0) return true;

    // Centre of that corner's arc, then the usual "outside the quarter-circle"
    // check — which only bites inside the corner square itself.
    const sx = Math.sign(p.x || 1);
    const sy = Math.sign(p.y || 1);
    const dx = p.x - sx * (width / 2 - r);
    const dy = p.y - sy * (height / 2 - r);
    if (Math.sign(dx || 1) !== sx || Math.sign(dy || 1) !== sy) return true;
    return dx * dx + dy * dy <= (r + tolerance) * (r + tolerance);
}

/**
 * Ellipse, honouring the same `ratio`/`sweep`/`startAngle` family the renderer
 * draws (see `EllipseShape.buildSVGPath`), so the grab region is the region that
 * was actually painted:
 *
 * - full sweep, `ratio` ≤ 0 or ≥ 1 → solid disk
 * - full sweep, 0 < `ratio` < 1    → annulus (the hole is not hittable)
 * - partial sweep, `ratio` ≥ 1     → the band has collapsed to the bare outer
 *                                    curve, so only points near that curve hit
 * - partial sweep, otherwise       → wedge / annular sector
 */
function containsEllipse(
    p: Vector2, width: number, height: number,
    ratio: number, sweep: number, startAngle: number,
    tolerance: number,
): boolean {
    const rx = width / 2;
    const ry = height / 2;
    if (rx <= 0 || ry <= 0) return false;

    const clamped = Math.max(0, Math.min(1, ratio));
    const full = Math.abs(sweep) >= 360;

    // Outside the outer curve (grown by tolerance) can never hit.
    if (norm(p, rx + tolerance, ry + tolerance) > 1) return false;

    // The inner boundary, as a fraction of the outer. A *full* ellipse at
    // ratio ≥ 1 is the solid disk, not a ring — the degenerate bare-curve case
    // exists only for a partial arc.
    const degenerateCurve = !full && clamped >= 1;
    const innerFrac = degenerateCurve ? 1 : (clamped >= 1 ? 0 : clamped);
    if (innerFrac > 0) {
        const inner = norm(p, Math.max(EPS, rx * innerFrac - tolerance), Math.max(EPS, ry * innerFrac - tolerance));
        if (inner < 1) return false;
    }

    if (full) return true;
    return withinSweep(Math.atan2(p.y / ry, p.x / rx) * (180 / Math.PI), startAngle, sweep, p, tolerance);
}

/** Normalised radius of `p` on an ellipse of half-axes `rx`/`ry` (1 = on the curve). */
function norm(p: Vector2, rx: number, ry: number): number {
    return Math.hypot(p.x / rx, p.y / ry);
}

/**
 * Whether `angleDeg` lies within the arc `[startAngle, startAngle + sweep]`,
 * with `tolerance` converted to angular slack at the point's own radius so
 * grab-slop widens the wedge's straight edges too. Handles negative sweeps.
 */
function withinSweep(
    angleDeg: number, startAngle: number, sweep: number,
    p: Vector2, tolerance: number,
): boolean {
    const lo = sweep >= 0 ? startAngle : startAngle + sweep;
    const span = Math.abs(sweep);
    // Near the centre every angle is within tolerance of the wedge.
    const radius = Math.hypot(p.x, p.y);
    if (radius <= tolerance) return true;
    const slack = tolerance > 0 ? (tolerance / Math.max(radius, EPS)) * (180 / Math.PI) : 0;
    let delta = (angleDeg - lo) % 360;
    if (delta < 0) delta += 360;
    // Accept the wrap-around side within slack as well.
    return delta <= span + slack || delta >= 360 - slack;
}

/**
 * Vertices of a regular polygon inscribed in `width`×`height`, y-up author
 * space. The renderer starts at the top vertex and steps clockwise in canvas
 * space; in y-up that is `+π/2` stepping negative.
 */
export function polygonVertices(width: number, height: number, sides: number): Vector2[] {
    const n = Math.max(3, Math.round(sides));
    const rx = width / 2;
    const ry = height / 2;
    const step = (2 * Math.PI) / n;
    const out: Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 - i * step;
        out.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
    }
    return out;
}

/** Vertices of a star polygon: outer radius 1 alternating with inner radius `ratio`. */
export function polygramVertices(width: number, height: number, sides: number, ratio: number): Vector2[] {
    const n = Math.max(3, Math.round(sides));
    const r = Math.max(0, Math.min(1, ratio));
    const rx = width / 2;
    const ry = height / 2;
    const step = Math.PI / n;
    const out: Vector2[] = [];
    for (let i = 0; i < n * 2; i++) {
        const a = Math.PI / 2 - i * step;
        const k = i % 2 === 0 ? 1 : r;
        out.push({ x: rx * k * Math.cos(a), y: ry * k * Math.sin(a) });
    }
    return out;
}

/**
 * Even-odd crossing test against a polygon, widened by `tolerance`: a point just
 * outside an edge still counts. `closed` also closes the last→first segment for
 * the tolerance band.
 */
function containsPolyline(p: Vector2, verts: readonly Vector2[], closed: boolean, tolerance: number): boolean {
    if (verts.length >= 3 && pointInPolygon(p, verts)) return true;
    return tolerance > 0 && nearPolyline(p, verts, closed, tolerance);
}

/** Even-odd crossing test against a closed polygon. No tolerance band. */
export function pointInPolygon(p: Vector2, verts: readonly Vector2[]): boolean {
    if (verts.length < 3) return false;
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const a = verts[i];
        const b = verts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/** Whether `p` is within `tolerance` of any segment of the polyline. */
export function nearPolyline(p: Vector2, pts: readonly Vector2[], closed: boolean, tolerance: number): boolean {
    if (pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= tolerance;
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
        if (distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= tolerance) return true;
    }
    return false;
}

/** Shortest distance from `p` to the segment `a`–`b`. */
export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= EPS) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
