import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { shapeDemo } from "./shape-demo";

/** Drop shadow animating color, blur radius, and offset. */
export default createScene(shapeDemo({
        label: 'Shadow',
        fillFrom: Fills.color('#161a21'),
        fillTo: Fills.color('#161a21'),
        shadowFrom: { fill: Fills.color('#6990DD', { opacity: 0.8 }), blur: 0, dx: 0, dy: 0 },
        shadowTo: { fill: Fills.color('#E8617C', { opacity: 0.8 }), blur: 40, dx: 30, dy: 30 },
    }));
