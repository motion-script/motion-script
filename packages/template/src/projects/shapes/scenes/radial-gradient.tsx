import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Radial gradient animating its colors, center, and radius. */
export class RadialGradientScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Radial Gradient',
        fillFrom: Fill.radialGradient(['#6990DD', '#161a21'], { center: { x: -0.4, y: -0.4 }, radius: 100 }),
        fillTo: Fill.radialGradient(['#E8617C', '#F5C26B'], { center: { x: 0.4, y: 0.4 }, radius: 400 }),
    };
}
