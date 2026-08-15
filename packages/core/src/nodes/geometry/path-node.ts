
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import type { PathData } from "@/render/descriptors/path";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Measurer } from "@/render/measurer";
import { Size2D } from "@/attributes/layout/size";
import { InsetsResolved } from "@/attributes/layout/insets";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";
import { lerpPath } from "@/attributes/shape/path/morph";
import { measurePathData } from "@/attributes/shape/path/bounds";

export interface PathProps extends ShapeProps {
    data: PathData;
}

export class Path extends ShapeNode<PathProps> {

    /**
     * The path geometry, as an SVG `d` string or a {@link PathCommand} array.
     *
     * Animatable: `to({ data })` morphs smoothly between arbitrary shapes via
     * {@link lerpPath}, which reconciles differing command/subpath counts, point
     * order, and winding before interpolating. Strings and command arrays may be
     * freely mixed as the source and target.
     */
    @property({ default: "", tween: lerpPath })
    declare readonly data: PathData;

    constructor(props: NodeConfig<Path, PathProps>) {
        super(props);
    }

    // A Path always sizes to its own geometry — it has no children to hug —
    // so it ignores the base has-children default and always hugs.
    protected override applyDefaultSize(props?: NodeConfig<Path, PathProps>): void {
        this.applyProp("width", props?.width ?? "hug");
        this.applyProp("height", props?.height ?? "hug");
    }

    measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
        const wm = this.width;
        const hm = this.height;

        if (wm !== "hug" && hm !== "hug") {
            return super.measure(constraints, scope);
        }

        const intrinsic = measurePathData(this.data);
        const pad = this.padding as InsetsResolved;

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

    protected override shapeGraphics(): Graphics {
        return new Graphics().path({
            data: this.data,
            start: this.start,
            end: this.end,
        });
    }

    protected renderSelf(draw: RenderContext): void {
        // Stroke is deferred to renderStroke (drawn after children + overlay).
        draw.draw(this.shapeGraphics().fill(this.fill));
    }
}
