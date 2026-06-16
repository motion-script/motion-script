/**
 * Arc-length sampler for a path: flattens the geometry once into a polyline with
 * a cumulative-length table, then answers "where am I, and which way am I facing,
 * at distance `d` along the path?" in amortized O(1) for monotonically increasing
 * `d`.
 *
 * This drives text-on-path: each shaped glyph's horizontal advance becomes a
 * distance along the path, and {@link PathSampler.frameAt} gives the point and
 * unit tangent to position and rotate the glyph.
 *
 * Curves are flattened with the same per-curve resolution the dash walker uses;
 * arcs are flattened with the exact arc evaluator (not chord-approximated) so
 * circular/elliptical text wraps true curves.
 */
import { Vector2 } from "@/attributes/layout/vector2";
import { PathData, PathCommand } from "@/render/descriptors/path";
import { toPathCommands } from "./parse";
import {
    cubicAxis,
    quadAxis,
    distance,
    isSmoothCurveType,
    reflectControlPoint,
} from "./bezier";
import { arcVector2Function } from "./subpath";

/** Line segments each curve (and arc) is flattened into. Matches the dash walker. */
const SAMPLE_STEPS = 50;

/** A point on the path with the unit tangent direction there. */
export interface PathFrame {
    x: number;
    y: number;
    /** Unit tangent (direction of travel along the path). */
    tx: number;
    ty: number;
}

export interface PathSampler {
    /** Total arc length across all subpaths. */
    readonly length: number;
    /**
     * Point and unit tangent at arc-length distance `d` from the path start.
     * `d` is clamped to `[0, length]`. Returns `null` only for a degenerate
     * (zero-length) path. Keeps an internal cursor so repeated calls with
     * non-decreasing `d` are amortized O(1).
     */
    frameAt(d: number): PathFrame | null;
}

/** A flattened point. `break` marks the start of a new subpath: the gap from the
 * previous point to it carries no arc length (text doesn't flow across the jump),
 * matching SVG `textPath`. */
interface FlatPoint extends Vector2 {
    break?: boolean;
}

/**
 * Flatten every path command into one point list. Subpaths (`M`/`m`) start a new
 * run marked with `break` so the gap between subpaths is not counted as length;
 * text resumes at the next subpath's start. Arcs use the exact arc
 * parametrization; other curves are sampled like {@link samplePathCommands}.
 */
function flatten(commands: PathCommand[]): FlatPoint[] {
    const points: FlatPoint[] = [];
    let curX = 0, curY = 0;
    let startX = 0, startY = 0;
    let prevCpX = 0, prevCpY = 0;

    const add = (x: number, y: number) => points.push({ x, y });
    const addBreak = (x: number, y: number) => points.push({ x, y, break: true });
    const sampleArc = (from: Vector2, to: Vector2, rx: number, ry: number, rot: number, large: 0 | 1, sweep: 0 | 1) => {
        const fn = arcVector2Function(from, to, rx, ry, rot, large, sweep);
        for (let i = 1; i <= SAMPLE_STEPS; i++) {
            const p = fn(i / SAMPLE_STEPS);
            add(p.x, p.y);
        }
    };

    for (const cmd of commands) {
        let nextX = curX, nextY = curY;
        let nextCpX = curX, nextCpY = curY;

        switch (cmd.type) {
            case 'M': addBreak(cmd.x, cmd.y); nextX = cmd.x; nextY = cmd.y; startX = nextX; startY = nextY; break;
            case 'm': nextX = curX + cmd.x; nextY = curY + cmd.y; addBreak(nextX, nextY); startX = nextX; startY = nextY; break;
            case 'L': nextX = cmd.x; nextY = cmd.y; add(nextX, nextY); break;
            case 'l': nextX = curX + cmd.x; nextY = curY + cmd.y; add(nextX, nextY); break;
            case 'H': nextX = cmd.x; add(nextX, curY); break;
            case 'h': nextX = curX + cmd.x; add(nextX, curY); break;
            case 'V': nextY = cmd.y; add(curX, nextY); break;
            case 'v': nextY = curY + cmd.y; add(curX, nextY); break;
            case 'C': {
                nextCpX = cmd.x2; nextCpY = cmd.y2;
                nextX = cmd.x; nextY = cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(cubicAxis(t, curX, cmd.x1, cmd.x2, nextX), cubicAxis(t, curY, cmd.y1, cmd.y2, nextY));
                }
                break;
            }
            case 'c': {
                const ax1 = curX + cmd.x1, ay1 = curY + cmd.y1;
                const ax2 = curX + cmd.x2, ay2 = curY + cmd.y2;
                nextCpX = ax2; nextCpY = ay2;
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(cubicAxis(t, curX, ax1, ax2, nextX), cubicAxis(t, curY, ay1, ay2, nextY));
                }
                break;
            }
            case 'S': {
                const cp1x = reflectControlPoint(curX, prevCpX), cp1y = reflectControlPoint(curY, prevCpY);
                nextCpX = cmd.x2; nextCpY = cmd.y2;
                nextX = cmd.x; nextY = cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(cubicAxis(t, curX, cp1x, cmd.x2, nextX), cubicAxis(t, curY, cp1y, cmd.y2, nextY));
                }
                break;
            }
            case 's': {
                const cp1x = reflectControlPoint(curX, prevCpX), cp1y = reflectControlPoint(curY, prevCpY);
                const ax2 = curX + cmd.x2, ay2 = curY + cmd.y2;
                nextCpX = ax2; nextCpY = ay2;
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(cubicAxis(t, curX, cp1x, ax2, nextX), cubicAxis(t, curY, cp1y, ay2, nextY));
                }
                break;
            }
            case 'Q': {
                nextCpX = cmd.x1; nextCpY = cmd.y1;
                nextX = cmd.x; nextY = cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(quadAxis(t, curX, cmd.x1, nextX), quadAxis(t, curY, cmd.y1, nextY));
                }
                break;
            }
            case 'q': {
                const ax1 = curX + cmd.x1, ay1 = curY + cmd.y1;
                nextCpX = ax1; nextCpY = ay1;
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(quadAxis(t, curX, ax1, nextX), quadAxis(t, curY, ay1, nextY));
                }
                break;
            }
            case 'T': {
                const cp1x = reflectControlPoint(curX, prevCpX), cp1y = reflectControlPoint(curY, prevCpY);
                nextCpX = cp1x; nextCpY = cp1y;
                nextX = cmd.x; nextY = cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(quadAxis(t, curX, cp1x, nextX), quadAxis(t, curY, cp1y, nextY));
                }
                break;
            }
            case 't': {
                const cp1x = reflectControlPoint(curX, prevCpX), cp1y = reflectControlPoint(curY, prevCpY);
                nextCpX = cp1x; nextCpY = cp1y;
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(quadAxis(t, curX, cp1x, nextX), quadAxis(t, curY, cp1y, nextY));
                }
                break;
            }
            case 'A': {
                nextX = cmd.x; nextY = cmd.y;
                sampleArc({ x: curX, y: curY }, { x: nextX, y: nextY }, cmd.rx, cmd.ry, cmd.rotation, cmd.largeArc, cmd.sweep);
                break;
            }
            case 'a': {
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                sampleArc({ x: curX, y: curY }, { x: nextX, y: nextY }, cmd.rx, cmd.ry, cmd.rotation, cmd.largeArc, cmd.sweep);
                break;
            }
            case 'Z':
            case 'z':
                if (curX !== startX || curY !== startY) add(startX, startY);
                nextX = startX; nextY = startY;
                break;
        }

        curX = nextX;
        curY = nextY;

        if (isSmoothCurveType(cmd.type)) {
            prevCpX = nextCpX;
            prevCpY = nextCpY;
        } else {
            prevCpX = curX;
            prevCpY = curY;
        }
    }

    return points;
}

/**
 * Build a {@link PathSampler} from any {@link PathData} (SVG string or command
 * array). Flattens the geometry once and precomputes a cumulative arc-length
 * table for the walk.
 */
export function createPathSampler(d: PathData): PathSampler {
    const points = flatten(toPathCommands(d));

    // Cumulative arc length at each point: cumulative[i] is the distance from the
    // path start to points[i]. Segment i spans points[i] -> points[i+1]; a point
    // flagged `break` starts a new subpath, so the gap leading into it carries no
    // length (text doesn't flow across the jump).
    const cumulative: number[] = new Array(points.length);
    let total = 0;
    if (points.length > 0) {
        cumulative[0] = 0;
        for (let i = 1; i < points.length; i++) {
            if (!points[i].break) total += distance(points[i - 1], points[i]);
            cumulative[i] = total;
        }
    }

    let cursor = 0; // last segment index used, for the monotonic fast path.

    const frameAt = (d: number): PathFrame | null => {
        if (total <= 0 || points.length < 2) return null;
        const target = Math.max(0, Math.min(total, d));

        // Reset the cursor if the caller stepped backwards.
        if (cumulative[cursor] > target) cursor = 0;
        // Advance to the segment containing `target`, skipping zero-length gap
        // segments (those ending at a `break` point) so we land on real geometry.
        while (
            cursor < points.length - 2 &&
            (cumulative[cursor + 1] < target || points[cursor + 1].break)
        ) {
            cursor++;
        }

        const a = points[cursor];
        const b = points[cursor + 1];
        const segStart = cumulative[cursor];
        const segLen = cumulative[cursor + 1] - segStart;
        const t = segLen > 0 ? (target - segStart) / segLen : 0;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segDist = Math.hypot(dx, dy);
        // Degenerate segment: fall back to the point with no meaningful tangent.
        const tx = segDist > 0 ? dx / segDist : 1;
        const ty = segDist > 0 ? dy / segDist : 0;

        return { x: a.x + dx * t, y: a.y + dy * t, tx, ty };
    };

    return { length: total, frameAt };
}
