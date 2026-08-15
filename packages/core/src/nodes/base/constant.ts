import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { EasingFunction } from "@/tween/ease/type";
import { lerpNumber } from "@/tween/lerp";
import { tween } from "@/tween/tween";
import { Disposer } from "@/assets/record";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D, SizeConstraints, Vector2 } from "@/attributes";
import { MeasureScope, RenderContext } from "@/render";

export interface CustomProps extends ShapeProps {
    progress: number;
}

export class CustomNode extends ShapeNode<CustomProps> {


    @property({ default: 1 }) declare progress: number;

    constructor(props: NodeConfig<CustomNode, CustomProps>) {
        super(props);
    }



    protected override clipSelf(): Clip {
        return new Clip().ellipse({
            width: this.layoutRect.width,
            height: this.layoutRect.height,

        });
    }

    @command()
    progressTo(to: number, duration = 1, easing: EasingFunction = (t) => t): Command<CustomProps> {
        const from = this.progress;

        return this.animate<CustomProps>((t) => ({ progress: lerpNumber(from, to, t) }), duration, easing);
    }


    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {

    }

    protected override renderSelf(ctx: RenderContext): void {

    }

    override layout(rect: BoxBounds, measurer: Measurer): void {

    }

    protected hitTestSelf(local: Vector2, tolerance: number): boolean {
        const b = this._localBounds();
        return Math.abs(local.x - b.x) <= b.width / 2 + tolerance
            && Math.abs(local.y - b.y) <= b.height / 2 + tolerance;
    }


    prepareLayout(tracker: AssetTracker): void {
        tracker.addFont('Roboto');
        tracker.addAsync('key', async () => {
            // Simulate async font loading
            await new Promise(resolve => setTimeout(resolve, 1000));
        });

    }


    prepareRender(tracker: AssetTracker): void {
        tracker.addImage('./images/1.png', { width: 100, height: 100 });
    }

}
export interface Command<P> {
    readonly duration: number
    readonly easing?: EasingFunction
    /** Every prop this command writes, at normalized t ∈ [0,1]. Pure. */
    at(t: number): Partial<P>
    /** So a generator scene can still `yield*` it. */
    [Symbol.iterator](): Iterator<void>
}

export function command<P>(): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const command: Command<P> = originalMethod.apply(this, args);
            return command;
        }

        return descriptor;
    }

}

