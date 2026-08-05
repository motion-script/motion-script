import { Fills } from "motion-script";
import { createScene } from "motion-script";
import { shapeDemo } from "./shape-demo";

/** Image fill fading in via opacity. */
export default createScene(shapeDemo({
    label: 'Image Fills',
    fillFrom: Fills.image('./cat.jpg', { fit: 'fill', opacity: 0.1, zoom: 2 }),
    fillTo: Fills.image('./cat.jpg', { fit: 'fill', opacity: 1, zoom: 5 }),
    strokeWeight: 24,
}));
