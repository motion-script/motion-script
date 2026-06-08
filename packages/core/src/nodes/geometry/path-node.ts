
import { RenderContext } from "@/render/render-context";
import type { PathData, PathCommand } from "@/render/descriptors/path";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { Size2D } from "@/attributes/layout/size";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";

function measurePathData(d: PathData): { width: number; height: number } {
    const cmds: PathCommand[] = typeof d === "string" ? parsePathString(d) : d;

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

function parsePathString(d: string): PathCommand[] {
    const cmds: PathCommand[] = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?[\d.]+(?:e[-+]?\d+)?)/gi;
    const tokens: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) tokens.push(m[0]);

    let i = 0;
    const num = () => parseFloat(tokens[i++]);

    while (i < tokens.length) {
        const t = tokens[i++];
        switch (t) {
            case "M": cmds.push({ type: "M", x: num(), y: num() }); break;
            case "m": cmds.push({ type: "m", x: num(), y: num() }); break;
            case "L": cmds.push({ type: "L", x: num(), y: num() }); break;
            case "l": cmds.push({ type: "l", x: num(), y: num() }); break;
            case "H": cmds.push({ type: "H", x: num() }); break;
            case "h": cmds.push({ type: "h", x: num() }); break;
            case "V": cmds.push({ type: "V", y: num() }); break;
            case "v": cmds.push({ type: "v", y: num() }); break;
            case "C": cmds.push({ type: "C", x1: num(), y1: num(), x2: num(), y2: num(), x: num(), y: num() }); break;
            case "c": cmds.push({ type: "c", x1: num(), y1: num(), x2: num(), y2: num(), x: num(), y: num() }); break;
            case "S": cmds.push({ type: "S", x2: num(), y2: num(), x: num(), y: num() }); break;
            case "s": cmds.push({ type: "s", x2: num(), y2: num(), x: num(), y: num() }); break;
            case "Q": cmds.push({ type: "Q", x1: num(), y1: num(), x: num(), y: num() }); break;
            case "q": cmds.push({ type: "q", x1: num(), y1: num(), x: num(), y: num() }); break;
            case "T": cmds.push({ type: "T", x: num(), y: num() }); break;
            case "t": cmds.push({ type: "t", x: num(), y: num() }); break;
            case "A": cmds.push({ type: "A", rx: num(), ry: num(), rotation: num(), largeArc: num() as 0 | 1, sweep: num() as 0 | 1, x: num(), y: num() }); break;
            case "a": cmds.push({ type: "a", rx: num(), ry: num(), rotation: num(), largeArc: num() as 0 | 1, sweep: num() as 0 | 1, x: num(), y: num() }); break;
            case "Z": case "z": cmds.push({ type: "Z" }); break;
        }
    }
    return cmds;
}
export interface PathProps extends ShapeProps {
    d: PathData;
}

export class Path extends ShapeNode<PathProps> {


    readonly d: PathData;

    constructor(props: NodeConfig<Path, PathProps>) {
        super(props);
        this.d = (props.d as PathData) ?? "";
        this.applyProp("width", props.width ?? "hug");
        this.applyProp("height", props.height ?? "hug");
    }

    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const wm = this.width;
        const hm = this.height;

        if (wm !== "hug" && hm !== "hug") {
            return super.measure(constraints, scope);
        }

        const intrinsic = measurePathData(this.d);
        const pad = this.padding;

        const resolvedW = typeof wm === "number"
            ? wm
            : wm === "hug"
                ? intrinsic.width + pad.left + pad.right
                : constraints.maxWidth ?? 0;

        const resolvedH = typeof hm === "number"
            ? hm
            : hm === "hug"
                ? intrinsic.height + pad.top + pad.bottom
                : constraints.maxHeight ?? 0;

        return { width: resolvedW, height: resolvedH };
    }

    protected renderSelf(draw: RenderContext): void {
        draw.path({
            d: this.d,
            start: this.start,
            end: this.end,
        }).fill(this.fill).stroke(this.stroke);
    }
}
