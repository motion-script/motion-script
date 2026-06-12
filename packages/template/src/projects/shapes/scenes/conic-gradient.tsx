import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Conic gradient animating its colors and rotating its start angle. */
export class ConicGradientScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Conic Gradient',
        fillFrom: Fill.conicGradient(['#6990DD', '#E8617C', '#F5C26B', '#6990DD'], { startAngle: 0 }),
        fillTo: Fill.conicGradient(['#F5C26B', '#6990DD', '#E8617C', '#F5C26B'], { startAngle: 360 }),
    };
}
