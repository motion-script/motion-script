import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
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

// Its silhouette and paint are a pure function of its own props, so the
// composed drawing can be reused between frames. Registered by exact class:
// a subclass overriding `shapeGraphics` may read anything at all, and must
// opt in for itself. See `ShapeNode.MEMOIZABLE`.
ShapeNode.memoizeDrawing(Ellipse);
