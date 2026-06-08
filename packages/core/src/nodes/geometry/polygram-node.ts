import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { ClipShape, RenderContext } from "@/render/render-context";

export interface PolygramProps extends ShapeProps {
    /** Number of outer points. Must be ≥ 3. */
    sides: number;
    /**
     * Inner-to-outer radius ratio (0–1). Controls how deeply the star points are cut.
     * At 1 the shape degenerates into a regular polygon; lower values produce sharper points.
     */
    ratio: number;
    /** Corner rounding radius in pixels applied to both inner and outer vertices. */
    borderRadius: number;
}

/** Star polygon (polygram) — alternates outer and inner vertices to form a star shape. */
export class Polygram extends ShapeNode<PolygramProps> {

    /** Number of outer points (default: 5). */
    @property({ default: 5 }) declare sides: number;
    /** Inner-to-outer radius ratio (default: 0.5). */
    @property({ default: 0.5 }) declare ratio: number;
    /** Corner rounding radius in pixels (default: 0). */
    @property({ default: 0 }) declare borderRadius: number;

    constructor(props: NodeConfig<Polygram, PolygramProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.polygram({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            sides: this.sides,
            ratio: this.ratio,
            borderRadius: this.borderRadius,
            start: this.start,
            end: this.end,
        }).shadow(this.shadow).fill(this.fill).stroke(this.stroke);
    }

    protected override silhouette(): ClipShape {
        return {
            kind: "polygram",
            state: {
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                sides: this.sides,
                ratio: this.ratio,
                borderRadius: this.borderRadius,
            },
        };
    }
}
