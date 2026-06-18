
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import type { PathData } from "@/render/descriptors/path";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { MeasureScope } from "@/render/measure-scope";
import { Size2D } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";
import { lerpPath } from "@/attributes/shape/path/morph";
import { measurePathData } from "@/attributes/shape/path/bounds";

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
        const pad = this.padding as PaddingResolved;

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
