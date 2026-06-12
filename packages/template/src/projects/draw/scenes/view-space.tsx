import { FillSpace } from "@motion-script/core";
import { DrawDemoScene } from "./draw-demo";

/**
 * `view`: the gradient resolves against the render viewport, so it's anchored
 * to the screen itself. As the figure drifts the fill stays locked to the
 * frame — the shape reveals whichever slice of the viewport-wide gradient it
 * currently covers.
 */
export class ViewSpaceScene extends DrawDemoScene {
    readonly space: FillSpace = 'view';
    readonly label = 'Fill Space — view';
}
