import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";

import { Vector2 } from "@/attributes/layout/vector2";
import { ShapeNode, ShapeProps } from "./shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
export interface LineProps extends ShapeProps {
    points: Vector2[];
    radius: number;
    closed: boolean;

}
export class Line extends ShapeNode<LineProps> {



    @property({ default: [] }) declare points: Vector2[];
    @property({ default: 0 }) declare radius: number;
    @property({ default: false }) declare closed: boolean;

    constructor(props: NodeConfig<Line, LineProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .line({
                points: this.points,
                radius: this.radius,
                closed: this.closed,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow)
            .fill(this.fill)
            .stroke(this.stroke));
    }
}
