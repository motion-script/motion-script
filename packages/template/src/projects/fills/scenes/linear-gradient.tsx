import { Fills } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Linear gradient animating its colors and its start/end direction. */
export class LinearGradientScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Linear Gradient',
        fillFrom: Fills.linearGradient(['#6990DD', '#0D0F15'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }),
        fillTo: Fills.linearGradient(['#E8617C', '#F5C26B'], { start: { x: -1, y: 1 }, end: { x: 1, y: -1 } }),
    };
}
