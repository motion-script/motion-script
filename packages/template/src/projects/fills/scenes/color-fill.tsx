import { Fills } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Solid color fill/stroke animating both hue and opacity. */
export class ColorFillScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Color + Opacity',
        fillFrom: Fills.color('#6990DD', { opacity: 0.25 }),
        fillTo: Fills.color('#E8617C', { opacity: 1 }),
    };
}
