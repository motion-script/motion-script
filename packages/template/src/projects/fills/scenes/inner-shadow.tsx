import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { shapeDemo } from "./shape-demo";

/** Inner (inset) shadow animating color, blur radius, and offset. */
export default createScene(shapeDemo({
        label: 'Inner Shadow',
        fillFrom: Fills.color('#6990DD'),
        fillTo: Fills.color('#6990DD'),
        shadowFrom: { fill: Fills.color('#0B1020', { opacity: 0.85 }), blur: 4, dx: 4, dy: 4, inner: true },
        shadowTo: { fill: Fills.color('#0B1020', { opacity: 0.85 }), blur: 48, dx: 36, dy: 36, inner: true },
    }));
