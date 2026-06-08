/**
 * Extracts a sub-section of a path by arc length, used to animate a stroke
 * drawing in or out (the `start`/`end` trim on a shape).
 *
 * The pipeline is:
 *  1. {@link normalize} every command to absolute `M L C Q A Z` form.
 *  2. {@link buildSegments} turns those into measurable {@link Segment}s.
 *  3. {@link extractSubpath} walks the segments, cutting the two boundary
 *     segments with De Casteljau splitting so curves stay exact.
 */
import { Vector2 } from "@/attributes/layout/vector2";
import { PathData, PathCommand } from "@/render/descriptors/path";
import {
    distance,
    lerpVector2,
    cubicPoint,
    quadPoint,
    sampleCurveLength,
} from "./bezier";

// Local aliases keep the dense geometry below readable.
const dist = distance;
const lerpPt = lerpVector2;
const cubicAt = (p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number) => cubicPoint(p0, p1, p2, p3, t);
const quadAt = (p0: Vector2, p1: Vector2, p2: Vector2, t: number) => quadPoint(p0, p1, p2, t);

/**
 * Binary-search the curve parameter `t` whose arc length from the start equals
 * `targetDist`. Used to find exactly where a curve should be cut. The curve is
 * re-sampled on each probe, so this is intentionally simple rather than fast;
 * 20 iterations give sub-pixel precision for typical path lengths.
 */
function binarySearchParam(Vector2Fn: (t: number) => Vector2, targetDist: number, totalLen: number): number {
    if (totalLen === 0 || targetDist <= 0) return 0;
    if (targetDist >= totalLen) return 1;

    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        let len = 0;
        let prev = Vector2Fn(0);
        const steps = 16;
        for (let j = 1; j <= steps; j++) {
            const p = Vector2Fn(mid * j / steps);
            len += dist(prev, p);
            prev = p;
        }
        if (len < targetDist) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

// --- De Casteljau splitting ---
// Splitting a Bézier at parameter `t` yields two sub-curves that together trace
// the exact same shape, so trimming preserves curvature instead of polylining it.

function splitCubicAt(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number) {
    const a = lerpPt(p0, p1, t);
    const b = lerpPt(p1, p2, t);
    const c = lerpPt(p2, p3, t);
    const d = lerpPt(a, b, t);
    const e = lerpPt(b, c, t);
    const f = lerpPt(d, e, t);
    return {
        left: { from: p0, cp1: a, cp2: d, to: f },
        right: { from: f, cp1: e, cp2: c, to: p3 },
    };
}

/** The sub-cubic spanning parameters `t0..t1` of the original cubic. */
function extractCubicRange(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t0: number, t1: number) {
    if (t0 === 0) return splitCubicAt(p0, p1, p2, p3, t1).left;
    const { right } = splitCubicAt(p0, p1, p2, p3, t0);
    const adj = (t1 - t0) / (1 - t0);
    return splitCubicAt(right.from, right.cp1, right.cp2, right.to, adj).left;
}

function splitQuadAt(p0: Vector2, p1: Vector2, p2: Vector2, t: number) {
    const a = lerpPt(p0, p1, t);
    const b = lerpPt(p1, p2, t);
    const c = lerpPt(a, b, t);
    return {
        left: { from: p0, cp: a, to: c },
        right: { from: c, cp: b, to: p2 },
    };
}

/** The sub-quadratic spanning parameters `t0..t1` of the original quadratic. */
function extractQuadRange(p0: Vector2, p1: Vector2, p2: Vector2, t0: number, t1: number) {
    if (t0 === 0) return splitQuadAt(p0, p1, p2, t1).left;
    const { right } = splitQuadAt(p0, p1, p2, t0);
    const adj = (t1 - t0) / (1 - t0);
    return splitQuadAt(right.from, right.cp, right.to, adj).left;
}

// --- Arc endVector2-to-center conversion ---

function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
}

function arcVector2Function(
    from: Vector2, to: Vector2,
    rxRaw: number, ryRaw: number, rotation: number, largeArc: 0 | 1, sweep: 0 | 1,
): (t: number) => Vector2 {
    const phi = rotation * Math.PI / 180;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

    const dx = (from.x - to.x) / 2;
    const dy = (from.y - to.y) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    let rx = Math.abs(rxRaw), ry = Math.abs(ryRaw);
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }

    const rx2 = rx * rx, ry2 = ry * ry;
    const x1p2 = x1p * x1p, y1p2 = y1p * y1p;
    const sq = Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2));
    const sign = (largeArc === sweep) ? -1 : 1;
    const cxp = sign * Math.sqrt(sq) * (rx * y1p / ry);
    const cyp = sign * Math.sqrt(sq) * -(ry * x1p / rx);

    const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

    const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dtheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (sweep === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
    if (sweep === 1 && dtheta < 0) dtheta += 2 * Math.PI;

    return (t: number): Vector2 => {
        const angle = theta1 + t * dtheta;
        return {
            x: cosPhi * rx * Math.cos(angle) - sinPhi * ry * Math.sin(angle) + cx,
            y: sinPhi * rx * Math.cos(angle) + cosPhi * ry * Math.sin(angle) + cy,
        };
    };
}

// --- Segment abstraction ---

/**
 * A single measurable piece of a path (line, cubic, quad, or arc). The abstraction
 * lets {@link extractSubpath} treat every segment type uniformly: measure it, map a
 * distance to a parameter, sample a point, and emit the commands for a sub-range.
 */
interface Segment {
    from: Vector2;
    to: Vector2;
    /** Arc length of the segment. */
    length: number;
    /** Point on the segment at parameter `t` (0..1). */
    Vector2At(t: number): Vector2;
    /** Parameter `t` (0..1) at arc-length distance `d` from the start. */
    paramAtDist(d: number): number;
    /** Commands tracing the segment from parameter `t0` to `t1`. */
    splitCommands(t0: number, t1: number): PathCommand[];
}

function lineSegment(from: Vector2, to: Vector2): Segment {
    const len = dist(from, to);
    return {
        from, to, length: len,
        Vector2At: (t) => lerpPt(from, to, t),
        paramAtDist: (d) => len > 0 ? d / len : 0,
        splitCommands: (t0, t1) => {
            const p = lerpPt(from, to, t1);
            return [{ type: "L", x: p.x, y: p.y }];
        },
    };
}

function cubicSegment(from: Vector2, cp1: Vector2, cp2: Vector2, to: Vector2): Segment {
    const ptFn = (t: number) => cubicAt(from, cp1, cp2, to, t);
    const len = sampleCurveLength(ptFn);
    return {
        from, to, length: len,
        Vector2At: ptFn,
        paramAtDist: (d) => binarySearchParam(ptFn, d, len),
        splitCommands: (t0, t1) => {
            const sub = extractCubicRange(from, cp1, cp2, to, t0, t1);
            return [{ type: "C", x1: sub.cp1.x, y1: sub.cp1.y, x2: sub.cp2.x, y2: sub.cp2.y, x: sub.to.x, y: sub.to.y }];
        },
    };
}

function quadSegment(from: Vector2, cp: Vector2, to: Vector2): Segment {
    const ptFn = (t: number) => quadAt(from, cp, to, t);
    const len = sampleCurveLength(ptFn);
    return {
        from, to, length: len,
        Vector2At: ptFn,
        paramAtDist: (d) => binarySearchParam(ptFn, d, len),
        splitCommands: (t0, t1) => {
            const sub = extractQuadRange(from, cp, to, t0, t1);
            return [{ type: "Q", x1: sub.cp.x, y1: sub.cp.y, x: sub.to.x, y: sub.to.y }];
        },
    };
}

function arcSegment(
    from: Vector2, to: Vector2,
    rx: number, ry: number, rotation: number, largeArc: 0 | 1, sweep: 0 | 1,
): Segment {
    const ptFn = arcVector2Function(from, to, rx, ry, rotation, largeArc, sweep);
    const len = sampleCurveLength(ptFn);
    return {
        from, to, length: len,
        Vector2At: ptFn,
        paramAtDist: (d) => binarySearchParam(ptFn, d, len),
        splitCommands: (t0, t1) => {
            // Approximate sub-arc with cubic bezier segments
            const steps = Math.max(4, Math.ceil(len / 10));
            const commands: PathCommand[] = [];
            for (let i = 0; i < steps; i++) {
                const st = t0 + (t1 - t0) * (i / steps);
                const et = t0 + (t1 - t0) * ((i + 1) / steps);
                const p0 = ptFn(st);
                const p3 = ptFn(et);
                const dt = (et - st) / 3;
                const p1 = ptFn(st + dt);
                const p2 = ptFn(et - dt);
                // Fit cubic through sampled Vector2s (catmull-rom-like approximation)
                commands.push({
                    type: "C",
                    x1: p0.x + (p1.x - p0.x) * 1.5,
                    y1: p0.y + (p1.y - p0.y) * 1.5,
                    x2: p3.x + (p2.x - p3.x) * 1.5,
                    y2: p3.y + (p2.y - p3.y) * 1.5,
                    x: p3.x,
                    y: p3.y,
                });
            }
            return commands;
        },
    };
}

// --- Normalize commands to absolute M, L, C, Q, A, Z ---

/**
 * Rewrites a command list into absolute `M L C Q A Z` form: relative commands are
 * resolved against the pen, H/V become L, and S/T/s/t are expanded to full C/Q by
 * reflecting the previous control point. Downstream code then handles only five
 * command types instead of all twenty.
 */
function normalize(commands: PathCommand[]): PathCommand[] {
    const result: PathCommand[] = [];
    let cx = 0, cy = 0;
    let sx = 0, sy = 0;
    let prevCp2: Vector2 | null = null;
    let prevQCp: Vector2 | null = null;

    for (const cmd of commands) {
        switch (cmd.type) {
            case "M":
                cx = cmd.x; cy = cmd.y; sx = cx; sy = cy;
                result.push(cmd);
                prevCp2 = null; prevQCp = null;
                break;
            case "m":
                cx += cmd.x; cy += cmd.y; sx = cx; sy = cy;
                result.push({ type: "M", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "L":
                result.push(cmd); cx = cmd.x; cy = cmd.y;
                prevCp2 = null; prevQCp = null;
                break;
            case "l":
                cx += cmd.x; cy += cmd.y;
                result.push({ type: "L", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "H":
                cx = cmd.x;
                result.push({ type: "L", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "h":
                cx += cmd.x;
                result.push({ type: "L", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "V":
                cy = cmd.y;
                result.push({ type: "L", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "v":
                cy += cmd.y;
                result.push({ type: "L", x: cx, y: cy });
                prevCp2 = null; prevQCp = null;
                break;
            case "C":
                result.push(cmd);
                prevCp2 = { x: cmd.x2, y: cmd.y2 };
                cx = cmd.x; cy = cmd.y;
                prevQCp = null;
                break;
            case "c":
                result.push({
                    type: "C",
                    x1: cx + cmd.x1, y1: cy + cmd.y1,
                    x2: cx + cmd.x2, y2: cy + cmd.y2,
                    x: cx + cmd.x, y: cy + cmd.y,
                });
                prevCp2 = { x: cx + cmd.x2, y: cy + cmd.y2 };
                cx += cmd.x; cy += cmd.y;
                prevQCp = null;
                break;
            case "S": {
                const cp1x = prevCp2 ? 2 * cx - prevCp2.x : cx;
                const cp1y = prevCp2 ? 2 * cy - prevCp2.y : cy;
                result.push({ type: "C", x1: cp1x, y1: cp1y, x2: cmd.x2, y2: cmd.y2, x: cmd.x, y: cmd.y });
                prevCp2 = { x: cmd.x2, y: cmd.y2 };
                cx = cmd.x; cy = cmd.y;
                prevQCp = null;
                break;
            }
            case "s": {
                const cp1x = prevCp2 ? 2 * cx - prevCp2.x : cx;
                const cp1y = prevCp2 ? 2 * cy - prevCp2.y : cy;
                result.push({
                    type: "C", x1: cp1x, y1: cp1y,
                    x2: cx + cmd.x2, y2: cy + cmd.y2,
                    x: cx + cmd.x, y: cy + cmd.y,
                });
                prevCp2 = { x: cx + cmd.x2, y: cy + cmd.y2 };
                cx += cmd.x; cy += cmd.y;
                prevQCp = null;
                break;
            }
            case "Q":
                result.push(cmd);
                prevQCp = { x: cmd.x1, y: cmd.y1 };
                cx = cmd.x; cy = cmd.y;
                prevCp2 = null;
                break;
            case "q":
                result.push({
                    type: "Q",
                    x1: cx + cmd.x1, y1: cy + cmd.y1,
                    x: cx + cmd.x, y: cy + cmd.y,
                });
                prevQCp = { x: cx + cmd.x1, y: cy + cmd.y1 };
                cx += cmd.x; cy += cmd.y;
                prevCp2 = null;
                break;
            case "T": {
                const qx: number = prevQCp ? 2 * cx - prevQCp.x : cx;
                const qy: number = prevQCp ? 2 * cy - prevQCp.y : cy;
                result.push({ type: "Q", x1: qx, y1: qy, x: cmd.x, y: cmd.y });
                prevQCp = { x: qx, y: qy };
                cx = cmd.x; cy = cmd.y;
                prevCp2 = null;
                break;
            }
            case "t": {
                const qx: number = prevQCp ? 2 * cx - prevQCp.x : cx;
                const qy: number = prevQCp ? 2 * cy - prevQCp.y : cy;
                result.push({ type: "Q", x1: qx, y1: qy, x: cx + cmd.x, y: cy + cmd.y });
                prevQCp = { x: qx, y: qy };
                cx += cmd.x; cy += cmd.y;
                prevCp2 = null;
                break;
            }
            case "A":
                result.push(cmd);
                cx = cmd.x; cy = cmd.y;
                prevCp2 = null; prevQCp = null;
                break;
            case "a":
                result.push({
                    type: "A",
                    rx: cmd.rx, ry: cmd.ry, rotation: cmd.rotation,
                    largeArc: cmd.largeArc, sweep: cmd.sweep,
                    x: cx + cmd.x, y: cy + cmd.y,
                });
                cx += cmd.x; cy += cmd.y;
                prevCp2 = null; prevQCp = null;
                break;
            case "Z": case "z":
                result.push({ type: "Z" });
                cx = sx; cy = sy;
                prevCp2 = null; prevQCp = null;
                break;
        }
    }
    return result;
}

// --- Build segments from normalized commands ---

/** Normalizes commands and turns each drawing command into a {@link Segment}. */
function buildSegments(commands: PathCommand[]): Segment[] {
    const normalized = normalize(commands);
    const segments: Segment[] = [];
    let cursor: Vector2 = { x: 0, y: 0 };
    let subpathStart: Vector2 = { x: 0, y: 0 };

    for (const cmd of normalized) {
        switch (cmd.type) {
            case "M":
                cursor = { x: cmd.x, y: cmd.y };
                subpathStart = cursor;
                break;
            case "L": {
                const to = { x: cmd.x, y: cmd.y };
                if (dist(cursor, to) > 0) segments.push(lineSegment(cursor, to));
                cursor = to;
                break;
            }
            case "C": {
                const cp1 = { x: cmd.x1, y: cmd.y1 };
                const cp2 = { x: cmd.x2, y: cmd.y2 };
                const to = { x: cmd.x, y: cmd.y };
                segments.push(cubicSegment(cursor, cp1, cp2, to));
                cursor = to;
                break;
            }
            case "Q": {
                const cp = { x: cmd.x1, y: cmd.y1 };
                const to = { x: cmd.x, y: cmd.y };
                segments.push(quadSegment(cursor, cp, to));
                cursor = to;
                break;
            }
            case "A": {
                const to = { x: cmd.x, y: cmd.y };
                segments.push(arcSegment(cursor, to, cmd.rx, cmd.ry, cmd.rotation, cmd.largeArc, cmd.sweep));
                cursor = to;
                break;
            }
            case "Z": {
                if (dist(cursor, subpathStart) > 0) {
                    segments.push(lineSegment(cursor, subpathStart));
                }
                cursor = subpathStart;
                break;
            }
        }
    }
    return segments;
}

// --- Main export ---

/**
 * Returns the portion of a path between the normalized arc-length fractions
 * `start` and `end` (both 0..1), as a fresh command list. This is what drives a
 * "trim path" / draw-on animation.
 *
 * Fast paths: a full `0..1` range, a string `d` (already opaque), or an empty
 * path are returned unchanged; an empty/inverted range returns `[]`.
 *
 * @param d     Source path (command array; strings pass through untouched).
 * @param start Fraction of total length where the result begins (clamped to 0..1).
 * @param end   Fraction where it ends (clamped to `start`..1).
 */
export function extractSubpath(d: PathData, start: number, end: number): PathData {
    if (start === 0 && end === 1) return d;
    if (typeof d === "string") return d;
    if (d.length === 0) return d;

    const s = Math.max(0, Math.min(1, start));
    const e = Math.max(s, Math.min(1, end));
    if (s === 0 && e === 1) return d;
    if (s >= e) return [];

    const segments = buildSegments(d);
    const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
    if (totalLength === 0) return d;

    const startDist = s * totalLength;
    const endDist = e * totalLength;

    const result: PathCommand[] = [];
    let accumulated = 0;
    let needsMoveTo = true;

    for (const seg of segments) {
        const segEnd = accumulated + seg.length;

        if (segEnd <= startDist || accumulated >= endDist || seg.length === 0) {
            accumulated = segEnd;
            continue;
        }

        let t0 = 0, t1 = 1;
        if (accumulated < startDist) {
            t0 = seg.paramAtDist(startDist - accumulated);
        }
        if (segEnd > endDist) {
            t1 = seg.paramAtDist(endDist - accumulated);
        }

        if (needsMoveTo) {
            const p = seg.Vector2At(t0);
            result.push({ type: "M", x: p.x, y: p.y });
            needsMoveTo = false;
        }

        result.push(...seg.splitCommands(t0, t1));
        accumulated = segEnd;
    }

    return result;
}
