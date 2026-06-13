import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { CornerStyle } from "@/attributes/shape/corners/corner-style";
import { lerpCornerScalarStyle } from "@/attributes/shape/corners/corner-scalar";

export interface PolygonProps extends ShapeProps {
    /** Number of sides. Must be ≥ 3. */
    sides: number;
    /** Vertex rounding radius in pixels. */
    cornerRadius: number;
    /** Vertex shape: `'rounded'` (circular arc) or `'angled'` (chamfer). */
    cornerStyle: CornerStyle;
}

/** Regular polygon (equilateral, equiangular) inscribed within the node's layout rect. */
export class Polygon extends ShapeNode<PolygonProps> {

    /** Number of sides (default: 5). */
    @property({ default: 5 }) declare sides: number;
    /** Vertex rounding radius in pixels (default: 0). */
    @property({ default: 0 }) declare cornerRadius: number;
    /** Vertex shape (default: `'rounded'`). */
    @property({ default: "rounded", tween: lerpCornerScalarStyle }) declare cornerStyle: CornerStyle;

    constructor(props: NodeConfig<Polygon, PolygonProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .polygon({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                sides: this.sides,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
    }

    protected override clipSelf(): Clip {
        return new Clip().polygon({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            sides: this.sides,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }
}
