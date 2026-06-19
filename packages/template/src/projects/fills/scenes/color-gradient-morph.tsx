import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { shapeDemo } from "./shape-demo";

/**
 * Solid color morphing into a linear gradient (and a gradient morphing back to a
 * solid color via the stroke sample). Exercises cross-type fill lerping —
 * frame 0 should read as the flat color, then resolve into the gradient.
 */
export default createScene(shapeDemo({
        label: 'Color → Gradient',
        // Fills sample: solid color → linear gradient.
        fillFrom: Fills.color('#6990DD'),
        fillTo: Fills.linearGradient(['#E8617C', '#F5C26B'], { start: { x: -1, y: 1 }, end: { x: 1, y: -1 } }),
        // Stroke sample: radial gradient → solid color (the reverse direction).
        strokeFrom: Fills.radialGradient(['#E8617C', '#0D0F15']),
        strokeTo: Fills.color('#6990DD'),
    }));
