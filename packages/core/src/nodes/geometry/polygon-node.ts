import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "@/nodes/2d/node2d";
import { Graphics2D } from "@/render/graphics2d";
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

    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().polygon({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            sides: this.sides,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    protected override clipSelf(): Clip {
        return new Clip().polygon({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            sides: this.sides,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }
}
