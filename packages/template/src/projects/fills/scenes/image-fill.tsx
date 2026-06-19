import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { shapeDemo } from "./shape-demo";

/** Image fill fading in via opacity. */
export default createScene(shapeDemo({
        label: 'Image Fills',
        fillFrom: Fills.image('./cat.jpg', { fit: 'fill', opacity: 0.1 }),
        fillTo: Fills.image('./cat.jpg', { fit: 'fill', opacity: 1 }),
        strokeWeight: 24,
    }));
