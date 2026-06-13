import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/**
 * Drop shadow animating `spread`, which grows the shadow's silhouette before it
 * is blurred — like CSS `box-shadow` spread. Spread is honoured only for
 * ellipses and rectangles, whose geometry resizes cleanly; the rounded-rect
 * samples here qualify.
 */
export class SpreadShadowScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Spread Shadow',
        fillFrom: Fill.color('#161a21'),
        fillTo: Fill.color('#161a21'),
        shadowFrom: { fill: Fill.color('#6990DD', { opacity: 0.8 }), blur: 24, dx: 0, dy: 0, spread: 0 },
        shadowTo: { fill: Fill.color('#6990DD', { opacity: 0.8 }), blur: 24, dx: 0, dy: 0, spread: 60 },
    };
}
