import { Fills } from "motion-script";
import { createScene } from "motion-script";
import { shapeDemo } from "./shape-demo";

/** Linear gradient animating its colors and its start/end direction. */
export default createScene(shapeDemo({
        label: 'Linear Gradient',
        fillFrom: Fills.linearGradient(['#6990DD', '#0D0F15'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }),
        fillTo: Fills.linearGradient(['#E8617C', '#F5C26B'], { start: { x: -1, y: 1 }, end: { x: 1, y: -1 } }),
    }));
