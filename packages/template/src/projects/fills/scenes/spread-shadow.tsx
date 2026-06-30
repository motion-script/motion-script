import { Fills } from "motion-script";
import { createScene } from "motion-script";
import { shapeDemo } from "./shape-demo";

/**
 * Drop shadow animating `spread`, which grows the shadow's silhouette before it
 * is blurred — like CSS `box-shadow` spread. Spread is honoured only for
 * ellipses and rectangles, whose geometry resizes cleanly; the rounded-rect
 * samples here qualify.
 */
export default createScene(shapeDemo({
        label: 'Spread Shadow',
        fillFrom: Fills.color('#161a21'),
        fillTo: Fills.color('#161a21'),
        shadowFrom: { fill: Fills.color('#6990DD', { opacity: 0.8 }), blur: 24, offset: { x: 0, y: 0 }, spread: 0 },
        shadowTo: { fill: Fills.color('#6990DD', { opacity: 0.8 }), blur: 24, offset: { x: 0, y: 0 }, spread: 60 },
    }));
