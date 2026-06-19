import { createScene } from "@motion-script/core";
import { drawDemo } from "./draw-demo";

/**
 * `local` (the default): the gradient resolves against the figure's own bounds,
 * so the fill is pinned to the shape. As the figure drifts across the card the
 * gradient travels with it — its appearance never changes, only its position.
 */
export default createScene(drawDemo({ space: 'local', label: 'Fill Space — local' }));
