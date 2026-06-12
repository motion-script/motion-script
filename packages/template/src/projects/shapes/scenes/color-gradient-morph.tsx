import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/**
 * Solid color morphing into a linear gradient (and a gradient morphing back to a
 * solid color via the stroke sample). Exercises cross-type fill lerping —
 * frame 0 should read as the flat color, then resolve into the gradient.
 */
export class ColorGradientMorphScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Color → Gradient',
        // Fill sample: solid color → linear gradient.
        fillFrom: Fill.color('#6990DD'),
        fillTo: Fill.linearGradient(['#E8617C', '#F5C26B'], { start: { x: -1, y: 1 }, end: { x: 1, y: -1 } }),
        // Stroke sample: radial gradient → solid color (the reverse direction).
        strokeFrom: Fill.radialGradient(['#E8617C', '#0D0F15']),
        strokeTo: Fill.color('#6990DD'),
    };
}
