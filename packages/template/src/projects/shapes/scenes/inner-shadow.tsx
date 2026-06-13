import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Inner (inset) shadow animating color, blur radius, and offset. */
export class InnerShadowScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Inner Shadow',
        fillFrom: Fill.color('#6990DD'),
        fillTo: Fill.color('#6990DD'),
        shadowFrom: { fill: Fill.color('#0B1020', { opacity: 0.85 }), blur: 4, dx: 4, dy: 4, inner: true },
        shadowTo: { fill: Fill.color('#0B1020', { opacity: 0.85 }), blur: 48, dx: 36, dy: 36, inner: true },
    };
}
