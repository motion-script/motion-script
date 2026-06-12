import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Drop shadow animating color, blur radius, and offset. */
export class ShadowScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Shadow',
        fillFrom: Fill.color('#161a21'),
        fillTo: Fill.color('#161a21'),
        shadowFrom: { fill: Fill.color('#6990DD', { opacity: 0.8 }), blur: 0, dx: 0, dy: 0 },
        shadowTo: { fill: Fill.color('#E8617C', { opacity: 0.8 }), blur: 40, dx: 30, dy: 30 },
    };
}
