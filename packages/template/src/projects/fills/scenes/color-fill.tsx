import { Fills } from "motion-script";
import { createScene } from "motion-script";
import { shapeDemo } from "./shape-demo";

/** Solid color fill/stroke animating both hue and opacity. */
export default createScene(shapeDemo({
    label: 'Color + Opacity',
    fillFrom: Fills.color('#6990DD', { opacity: 0.25 }),
    fillTo: Fills.color('#E8617C', { opacity: 1 }),
}));
