import { Fills } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Drop shadow animating color, blur radius, and offset. */
export class ShadowScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Shadow',
        fillFrom: Fills.color('#161a21'),
        fillTo: Fills.color('#161a21'),
        shadowFrom: { fill: Fills.color('#6990DD', { opacity: 0.8 }), blur: 0, dx: 0, dy: 0 },
        shadowTo: { fill: Fills.color('#E8617C', { opacity: 0.8 }), blur: 40, dx: 30, dy: 30 },
    };
}
