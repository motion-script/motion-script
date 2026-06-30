import { createScene } from "motion-script";
import { drawDemo } from "./draw-demo";

/**
 * `global`: the gradient resolves against the render viewport, so it's anchored
 * to the frame itself. As the figure drifts the fill stays locked to the screen
 * — the shape reveals whichever slice of the viewport-wide gradient it currently
 * covers. A faded copy of the same gradient fills the whole scene so that slice
 * lines up with the field behind it.
 */
export default createScene(drawDemo({ space: 'global', label: 'Fill Space — global', backdrop: 'scene' }));
