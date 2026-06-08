import { PathCommand } from "@/render/descriptors/path";
import { calculatePathLength } from "./length";
import { Vector2 } from "@/attributes/layout/vector2";
import {
    cubicAxis,
    quadAxis,
    distance,
    isSmoothCurveType,
    reflectControlPoint,
} from "./bezier";

/** Number of line segments each curve is flattened into when sampling. */
const SAMPLE_STEPS = 50;

/** A single connected run of points (one subpath between M commands). */
type SampledSubpath = Vector2[];

/**
 * Flattens path commands into one polyline per subpath. Curves are sampled into
 * {@link SAMPLE_STEPS} straight segments; the resulting points are what the dash
 * walker steps along to emit dashes at uniform arc-length intervals.
 */
function samplePathCommands(commands: PathCommand[]): SampledSubpath[] {
    const subpaths: SampledSubpath[] = [];
    let current: SampledSubpath = [];
    let curX = 0, curY = 0;
    let startX = 0, startY = 0;
    let prevCpX = 0, prevCpY = 0;

    const startSubpath = (x: number, y: number) => {
        if (current.length > 0) subpaths.push(current);
        current = [{ x, y }];
        startX = x; startY = y;
    };

    const add = (x: number, y: number) => current.push({ x, y });

    for (const cmd of commands) {
        let nextX = curX, nextY = curY;
        let nextCpX = curX, nextCpY = curY;

        switch (cmd.type) {
            case 'M':
                startSubpath(cmd.x, cmd.y);
                nextX = cmd.x; nextY = cmd.y;
                break;
            case 'm':
                startSubpath(curX + cmd.x, curY + cmd.y);
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                break;
            case 'L':
                nextX = cmd.x; nextY = cmd.y;
                add(nextX, nextY);
                break;
            case 'l':
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                add(nextX, nextY);
                break;
            case 'H':
                nextX = cmd.x;
                add(nextX, curY);
                break;
            case 'h':
                nextX = curX + cmd.x;
                add(nextX, curY);
                break;
            case 'V':
                nextY = cmd.y;
                add(curX, nextY);
                break;
            case 'v':
                nextY = curY + cmd.y;
                add(curX, nextY);
                break;
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
                // Linear approximation for arcs
                nextX = cmd.x; nextY = cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(curX + t * (nextX - curX), curY + t * (nextY - curY));
                }
                break;
            }
            case 'a': {
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                for (let i = 1; i <= SAMPLE_STEPS; i++) {
                    const t = i / SAMPLE_STEPS;
                    add(curX + t * (nextX - curX), curY + t * (nextY - curY));
                }
                break;
            }
            case 'Z':
            case 'z':
                if (curX !== startX || curY !== startY) {
                    add(startX, startY);
                }
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

    if (current.length > 0) subpaths.push(current);
    return subpaths;
}

/**
 * Walks a flattened subpath at constant speed, emitting `M`/`L` commands for the
 * "on" runs of the dash pattern. `scaledDash` alternates on/off lengths starting
 * with "on"; the index wraps so the pattern repeats along the whole subpath.
 */
function dashSubpath(points: SampledSubpath, scaledDash: number[]): string {
    if (points.length < 2) return '';

    const parts: string[] = [];
    let dashIndex = 0;
    let remaining = scaledDash[0]; // Distance left in the current dash segment.
    let isOn = true;               // Whether we're currently drawing (on) or skipping (off).
    let needMove = true;           // Whether the next "on" run still needs an opening M.

    for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const segLen = distance(p0, p1);

        if (segLen === 0) continue;

        let walked = 0;

        while (walked < segLen) {
            const available = segLen - walked;

            if (remaining >= available) {
                if (isOn) {
                    if (needMove) {
                        const t = walked / segLen;
                        parts.push(`M ${p0.x + t * dx} ${p0.y + t * dy}`);
                        needMove = false;
                    }
                    parts.push(`L ${p1.x} ${p1.y}`);
                }
                remaining -= available;
                walked = segLen;

                if (remaining === 0) {
                    dashIndex = (dashIndex + 1) % scaledDash.length;
                    isOn = !isOn;
                    remaining = scaledDash[dashIndex];
                    if (isOn) needMove = true;
                }
            } else {
                const endT = (walked + remaining) / segLen;
                const endX = p0.x + endT * dx;
                const endY = p0.y + endT * dy;

                if (isOn) {
                    if (needMove) {
                        const startT = walked / segLen;
                        parts.push(`M ${p0.x + startT * dx} ${p0.y + startT * dy}`);
                        needMove = false;
                    }
                    parts.push(`L ${endX} ${endY}`);
                }

                walked += remaining;
                dashIndex = (dashIndex + 1) % scaledDash.length;
                isOn = !isOn;
                remaining = scaledDash[dashIndex];
                if (isOn) needMove = true;
            }
        }
    }

    return parts.join(' ');
}

/**
 * Converts path commands into a dashed SVG path string.
 *
 * The dash pattern is scaled uniformly so a whole number of cycles spans the path
 * length — this avoids a half-cut dash at the start or end. Each subpath is then
 * flattened and walked, emitting only the "on" runs.
 *
 * @param commands Path commands to dash.
 * @param dash     Alternating on/off lengths (e.g. `[4, 2]` = 4 on, 2 off).
 * @returns An SVG path `d` string containing only the visible dash segments,
 *          or `''` when there is nothing to draw.
 */
export function applyDashPattern(commands: PathCommand[], dash: number[]): string {
    if (!dash || dash.length === 0) return '';

    const cycleLength = dash.reduce((a, b) => a + b, 0);
    if (cycleLength <= 0) return '';

    const totalLength = calculatePathLength(commands);
    if (totalLength <= 0) return '';

    const cycles = Math.max(1, Math.round(totalLength / cycleLength));
    const scale = totalLength / (cycles * cycleLength);
    const scaledDash = dash.map(d => d * scale);

    const subpaths = samplePathCommands(commands);

    return subpaths
        .map(sub => dashSubpath(sub, scaledDash))
        .filter(Boolean)
        .join(' ');
}
