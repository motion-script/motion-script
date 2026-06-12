import { Fill } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Image fill fading in via opacity. */
export class ImageFillScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Image Fill',
        fillFrom: Fill.image('./cat.jpg', { mode: 'fill', opacity: 0.1 }),
        fillTo: Fill.image('./cat.jpg', { mode: 'fill', opacity: 1 }),
        strokeWeight: 24,
    };
}
