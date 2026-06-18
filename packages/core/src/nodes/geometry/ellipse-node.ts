import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";

export interface EllipseProps extends ShapeProps {
    ratio: number;
    sweep: number;
    startAngle: number;
}

export class Ellipse extends ShapeNode<EllipseProps> {

    @property({ default: 0 }) declare startAngle: number;
    @property({ default: 360 }) declare sweep: number;
    @property({ default: 1 }) declare ratio: number;

    constructor(props: NodeConfig<Ellipse, EllipseProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .ellipse({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                startAngle: this.startAngle,
                sweep: this.sweep,
                ratio: this.ratio,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
    }

    protected override clipSelf(): Clip {
        return new Clip().ellipse({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            startAngle: this.startAngle,
            sweep: this.sweep,
            ratio: this.ratio,
        });
    }
}
