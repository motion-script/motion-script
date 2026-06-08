import { PathCommand } from "@/render/descriptors/path";
import {
    cubicAxis,
    quadAxis,
    isSmoothCurveType,
    reflectControlPoint,
    sampleCurveLength,
} from "./bezier";

/**
 * Estimates the total length of an SVG path by walking its commands and summing
 * each segment's length. Straight segments (L/H/V/Z) are measured exactly; curves
 * (C/S/Q/T) are flattened into `steps` line segments and summed.
 *
 * Arcs (A/a) are approximated as a straight chord — see the note in the A/a case.
 * For exact arc lengths, convert arcs to cubic Béziers before calling this.
 *
 * @param path  Path commands to measure (absolute or relative).
 * @param steps Flattening resolution for curved segments. Higher is more accurate.
 */
export function calculatePathLength(path: PathCommand[], steps: number = 20): number {
    let totalLength = 0;

    // Pen state.
    let curX = 0;
    let curY = 0;
    let startX = 0;
    let startY = 0;
    // Trailing control point of the previous curve, used to reflect S/T commands.
    let prevCpX = 0;
    let prevCpY = 0;

    const cubicLength = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
        sampleCurveLength(
            (t) => ({ x: cubicAxis(t, x0, x1, x2, x3), y: cubicAxis(t, y0, y1, y2, y3) }),
            steps,
        );

    const quadLength = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) =>
        sampleCurveLength(
            (t) => ({ x: quadAxis(t, x0, x1, x2), y: quadAxis(t, y0, y1, y2) }),
            steps,
        );

    for (const cmd of path) {
        let nextX = curX, nextY = curY;
        let nextCpX = curX, nextCpY = curY;
        let segmentLength = 0;

        switch (cmd.type) {
            case 'M':
                nextX = cmd.x; nextY = cmd.y;
                startX = nextX; startY = nextY;
                break;
            case 'm':
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                startX = nextX; startY = nextY;
                break;
            case 'L':
                nextX = cmd.x; nextY = cmd.y;
                segmentLength = Math.sqrt((nextX - curX) ** 2 + (nextY - curY) ** 2);
                break;
            case 'l':
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                segmentLength = Math.sqrt(cmd.x ** 2 + cmd.y ** 2);
                break;
            case 'H':
                nextX = cmd.x;
                segmentLength = Math.abs(nextX - curX);
                break;
            case 'h':
                nextX = curX + cmd.x;
                segmentLength = Math.abs(cmd.x);
                break;
            case 'V':
                nextY = cmd.y;
                segmentLength = Math.abs(nextY - curY);
                break;
            case 'v':
                nextY = curY + cmd.y;
                segmentLength = Math.abs(cmd.y);
                break;
            case 'C':
                nextX = cmd.x; nextY = cmd.y;
                nextCpX = cmd.x2; nextCpY = cmd.y2;
                segmentLength = cubicLength(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, nextX, nextY);
                break;
            case 'c':
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                nextCpX = curX + cmd.x2; nextCpY = curY + cmd.y2;
                segmentLength = cubicLength(curX, curY, curX + cmd.x1, curY + cmd.y1, curX + cmd.x2, curY + cmd.y2, nextX, nextY);
                break;
            case 'S': {
                const cp1x = reflectControlPoint(curX, prevCpX);
                const cp1y = reflectControlPoint(curY, prevCpY);
                nextX = cmd.x; nextY = cmd.y;
                nextCpX = cmd.x2; nextCpY = cmd.y2;
                segmentLength = cubicLength(curX, curY, cp1x, cp1y, cmd.x2, cmd.y2, nextX, nextY);
                break;
            }
            case 's': {
                const cp1x = reflectControlPoint(curX, prevCpX);
                const cp1y = reflectControlPoint(curY, prevCpY);
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                nextCpX = curX + cmd.x2; nextCpY = curY + cmd.y2;
                segmentLength = cubicLength(curX, curY, cp1x, cp1y, curX + cmd.x2, curY + cmd.y2, nextX, nextY);
                break;
            }
            case 'Q':
                nextX = cmd.x; nextY = cmd.y;
                nextCpX = cmd.x1; nextCpY = cmd.y1;
                segmentLength = quadLength(curX, curY, cmd.x1, cmd.y1, nextX, nextY);
                break;
            case 'q':
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                nextCpX = curX + cmd.x1; nextCpY = curY + cmd.y1;
                segmentLength = quadLength(curX, curY, curX + cmd.x1, curY + cmd.y1, nextX, nextY);
                break;
            case 'T': {
                const cp1x = reflectControlPoint(curX, prevCpX);
                const cp1y = reflectControlPoint(curY, prevCpY);
                nextX = cmd.x; nextY = cmd.y;
                nextCpX = cp1x; nextCpY = cp1y;
                segmentLength = quadLength(curX, curY, cp1x, cp1y, nextX, nextY);
                break;
            }
            case 't': {
                const cp1x = reflectControlPoint(curX, prevCpX);
                const cp1y = reflectControlPoint(curY, prevCpY);
                nextX = curX + cmd.x; nextY = curY + cmd.y;
                nextCpX = cp1x; nextCpY = cp1y;
                segmentLength = quadLength(curX, curY, cp1x, cp1y, nextX, nextY);
                break;
            }
            case 'A':
            case 'a':
                // Note: True arc length requires complex conversion to center-parameterization.
                // Approximating as a straight line to the end point.
                // For exact arc lengths, convert arcs to cubic beziers before passing to this function.
                nextX = cmd.type === 'A' ? cmd.x : curX + cmd.x;
                nextY = cmd.type === 'A' ? cmd.y : curY + cmd.y;
                segmentLength = Math.sqrt((nextX - curX) ** 2 + (nextY - curY) ** 2);
                break;
            case 'Z':
            case 'z':
                nextX = startX; nextY = startY;
                segmentLength = Math.sqrt((nextX - curX) ** 2 + (nextY - curY) ** 2);
                break;
        }

        totalLength += segmentLength;

        // Advance the pen.
        curX = nextX;
        curY = nextY;

        // Remember the trailing control point so a following S/T can reflect it.
        // If this command wasn't a curve, the implied control point is the current point.
        if (isSmoothCurveType(cmd.type)) {
            prevCpX = nextCpX;
            prevCpY = nextCpY;
        } else {
            prevCpX = curX;
            prevCpY = curY;
        }
    }

    return totalLength;
}
