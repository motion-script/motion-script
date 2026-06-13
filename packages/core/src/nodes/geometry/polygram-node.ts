import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { CornerStyle } from "@/attributes/shape/corners/corner-style";
import { lerpCornerScalarStyle } from "@/attributes/shape/corners/corner-scalar";

export interface PolygramProps extends ShapeProps {
    /** Number of outer points. Must be ≥ 3. */
    sides: number;
    /**
     * Inner-to-outer radius ratio (0–1). Controls how deeply the star points are cut.
     * At 1 the shape degenerates into a regular polygon; lower values produce sharper points.
     */
    ratio: number;
    /** Vertex rounding radius in pixels applied to both inner and outer vertices. */
    cornerRadius: number;
    /** Vertex shape: `'rounded'` (circular arc) or `'angled'` (chamfer). */
    cornerStyle: CornerStyle;
}

/** Star polygon (polygram) — alternates outer and inner vertices to form a star shape. */
export class Polygram extends ShapeNode<PolygramProps> {

    /** Number of outer points (default: 5). */
    @property({ default: 5 }) declare sides: number;
    /** Inner-to-outer radius ratio (default: 0.5). */
    @property({ default: 0.5 }) declare ratio: number;
    /** Vertex rounding radius in pixels (default: 0). */
    @property({ default: 0 }) declare cornerRadius: number;
    /** Vertex shape (default: `'rounded'`). */
    @property({ default: "rounded", tween: lerpCornerScalarStyle }) declare cornerStyle: CornerStyle;

    constructor(props: NodeConfig<Polygram, PolygramProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .polygram({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                sides: this.sides,
                ratio: this.ratio,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
    }

    protected override clipSelf(): Clip {
        return new Clip().polygram({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            sides: this.sides,
            ratio: this.ratio,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }
}
