/**
 * Axis-aligned bounding box of path geometry, used to size nodes that lay out
 * around a path (the Path node, and the Text node when wrapping text on a path).
 *
 * Control points are included in the scan, so curved paths get a conservative
 * box that fully contains the curve — exactness isn't required for layout/
 * hit-testing, and including control points avoids flattening here.
 */
import { PathData, PathCommand } from "@/render/descriptors/path";
import { toPathCommands } from "./parse";

export function measurePathData(d: PathData): { width: number; height: number } {
    const cmds: PathCommand[] = toPathCommands(d);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let cx = 0, cy = 0;

    const expand = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

    for (const cmd of cmds) {
        switch (cmd.type) {
            case "M": cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "m": cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "L": cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "l": cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "H": cx = cmd.x; expand(cx, cy); break;
            case "h": cx += cmd.x; expand(cx, cy); break;
            case "V": cy = cmd.y; expand(cx, cy); break;
            case "v": cy += cmd.y; expand(cx, cy); break;
            case "C":
                expand(cmd.x1, cmd.y1); expand(cmd.x2, cmd.y2);
                cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "c":
                expand(cx + cmd.x1, cy + cmd.y1); expand(cx + cmd.x2, cy + cmd.y2);
                cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "S":
                expand(cmd.x2, cmd.y2); cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "s":
                expand(cx + cmd.x2, cy + cmd.y2); cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "Q":
                expand(cmd.x1, cmd.y1); cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "q":
                expand(cx + cmd.x1, cy + cmd.y1); cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "T": cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "t": cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "A": cx = cmd.x; cy = cmd.y; expand(cx, cy); break;
            case "a": cx += cmd.x; cy += cmd.y; expand(cx, cy); break;
            case "Z": case "z": break;
        }
    }

    if (!isFinite(minX)) return { width: 0, height: 0 };
    return { width: maxX - minX, height: maxY - minY };
}
