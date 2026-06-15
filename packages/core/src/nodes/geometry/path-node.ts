
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import type { PathData, PathCommand } from "@/render/descriptors/path";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { Size2D } from "@/attributes/layout/size";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";
import { toPathCommands } from "@/attributes/shape/path/parse";
import { lerpPath } from "@/attributes/shape/path/morph";

function measurePathData(d: PathData): { width: number; height: number } {
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

export interface PathProps extends ShapeProps {
    d: PathData;
}

export class Path extends ShapeNode<PathProps> {

    /**
     * The path geometry, as an SVG `d` string or a {@link PathCommand} array.
     *
     * Animatable: `to({ d })` morphs smoothly between arbitrary shapes via
     * {@link lerpPath}, which reconciles differing command/subpath counts, point
     * order, and winding before interpolating. Strings and command arrays may be
     * freely mixed as the source and target.
     */
    @property({ default: "", tween: lerpPath })
    declare readonly d: PathData;

    constructor(props: NodeConfig<Path, PathProps>) {
        super(props);
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
        draw.draw(new Graphics()
            .path({
                d: this.d,
                start: this.start,
                end: this.end,
            })
            .fill(this.fill).stroke(this.stroke));
    }
}
