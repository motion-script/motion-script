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

    protected override shapeGraphics(): Graphics {
        return new Graphics().ellipse({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            startAngle: this.startAngle,
            sweep: this.sweep,
            ratio: this.ratio,
            start: this.start,
            end: this.end,
        });
    }

    protected renderSelf(draw: RenderContext): void {
        // Stroke is deferred to renderStroke (drawn after children + overlay).
        draw.draw(this.shapeGraphics().shadow(this.shadow).fill(this.fill));
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
