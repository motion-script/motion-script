import { Scene, createRef, Ellipse, FX, Text, ShapeProps, ShapeNode, property, NodeConfig, RenderContext, Graphics, ClipShape, Fill } from "@motion-script/core";
export interface CustomShapeProps extends ShapeProps {
    ratio: number;
    sweep: number;
    startAngle: number;
}

export class CustomShape extends ShapeNode<CustomShapeProps> {

    @property({ default: 0 }) declare startAngle: number;
    @property({ default: 360 }) declare sweep: number;
    @property({ default: 1 }) declare ratio: number;

    constructor(props: NodeConfig<CustomShape, CustomShapeProps>) {
        super(props);
    }

    protected renderSelf(ctx: RenderContext): void {
        // draw.draw(new Graphics()
        //     .mask({ mode: 'alpha', apply: 'fill' })
        //     .text({ text: "Mask", fontSize: 200, width: this.layoutRect.width })
        //     .fill('white').stroke(this.stroke)
        //     .applyMask()
        //     .rect({ width: 500, height: 500 }).fill(['white'])
        //     .ellipse({ x: -80, width: 100, height: 100 }).fill(['yellow'])
        //     .ellipse({ x: 120, width: 320, height: 400 }).fill(['green'])
        //     .rect({ x: 360, width: 280, height: 500 }).fill(['blue'])
        //     .endMask());
        const graphics = new Graphics().ellipse({
            width: this.layoutRect.width,
            height: this.layoutRect.height,

        }).ellipse({
            x: this.layoutRect.width / 2,
            y: -this.layoutRect.height / 2,
            width: this.layoutRect.width / 2,
            height: this.layoutRect.height / 2,
            effects: FX.blur(50).toJSON(),

        }).ellipse({
            x: this.layoutRect.width / 4,
            y: this.layoutRect.height / 2,
            width: this.layoutRect.width / 2,
            height: this.layoutRect.height / 2,

        }).shadow(this.shadow).fill(this.fill).stroke(this.stroke);
        ctx.draw(graphics);
    }

    protected override applyClip(ctx: RenderContext): void {
        ctx.beginClipEllipse({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            startAngle: this.startAngle,
            sweep: this.sweep,
            ratio: this.ratio,
        });
    }

    protected override silhouette(): ClipShape {
        return {
            kind: "ellipse",
            state: {
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                startAngle: this.startAngle,
                sweep: this.sweep,
                ratio: this.ratio,
            },
        };
    }
}

export class DrawScene extends Scene {
    *build() {
        this.set({ fill: ["#e8c584"] })

        const ref = createRef<CustomShape>();



        this.add(
            <CustomShape
                ref={ref}

                width={350}

                height={350}
                fill={Fill.linearGradient(['red', 'blue'])}
            //  stroke={{ weight: 4, fill: 'red', }}
            // shadow={{ fill: 'green', blur: 40, dx: 40, dy: -40 }}

            />,
        );

        yield* ref().to({ x: 700 }, 3);
    }
};