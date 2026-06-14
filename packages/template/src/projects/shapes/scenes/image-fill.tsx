import { Fills } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/** Image fill fading in via opacity. */
export class ImageFillScene extends ShapeDemoScene {
    readonly spec: ShapeDemoSpec = {
        label: 'Image Fills',
        fillFrom: Fills.image('./cat.jpg', { mode: 'fill', opacity: 0.1 }),
        fillTo: Fills.image('./cat.jpg', { mode: 'fill', opacity: 1 }),
        strokeWeight: 24,
    };
}
