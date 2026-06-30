import { Fills } from "motion-script";
import { createScene } from "motion-script";
import { shapeDemo } from "./shape-demo";

/** Inner (inset) shadow animating color, blur radius, and offset. */
export default createScene(shapeDemo({
        label: 'Inner Shadow',
        fillFrom: Fills.color('#6990DD'),
        fillTo: Fills.color('#6990DD'),
        shadowFrom: { fill: Fills.color('#0B1020', { opacity: 0.85 }), blur: 4, offset: { x: 4, y: 4 }, inner: true },
        shadowTo: { fill: Fills.color('#0B1020', { opacity: 0.85 }), blur: 48, offset: { x: 36, y: 36 }, inner: true },
    }));
