import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { shapeDemo } from "./shape-demo";

/** Conic gradient animating its colors and rotating its start angle. */
export default createScene(shapeDemo({
        label: 'Conic Gradient',
        fillFrom: Fills.conicGradient(['#6990DD', '#E8617C', '#F5C26B', '#6990DD'], { startAngle: 0 }),
        fillTo: Fills.conicGradient(['#F5C26B', '#6990DD', '#E8617C', '#F5C26B'], { startAngle: 360 }),
    }));
