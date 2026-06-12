import { FillSpace } from "@motion-script/core";
import { DrawDemoScene } from "./draw-demo";

/**
 * `global`: the gradient resolves against the render viewport, so it's anchored
 * to the frame itself. As the figure drifts the fill stays locked to the screen
 * — the shape reveals whichever slice of the viewport-wide gradient it currently
 * covers. A faded copy of the same gradient fills the whole scene so that slice
 * lines up with the field behind it.
 */
export class GlobalSpaceScene extends DrawDemoScene {
    readonly space: FillSpace = 'global';
    readonly label = 'Fill Space — global';
    readonly backdrop = 'scene' as const;
}
