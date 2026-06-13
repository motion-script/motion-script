import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";

export interface PolygonProps extends ShapeProps {
    /** Number of sides. Must be ≥ 3. */
    sides: number;
    /** Corner rounding radius in pixels. */
    borderRadius: number;
}

/** Regular polygon (equilateral, equiangular) inscribed within the node's layout rect. */
export class Polygon extends ShapeNode<PolygonProps> {

    /** Number of sides (default: 5). */
    @property({ default: 5 }) declare sides: number;
    /** Corner rounding radius in pixels (default: 0). */
    @property({ default: 0 }) declare borderRadius: number;

    constructor(props: NodeConfig<Polygon, PolygonProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .polygon({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                sides: this.sides,
                borderRadius: this.borderRadius,
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
            borderRadius: this.borderRadius,
        });
    }
}
