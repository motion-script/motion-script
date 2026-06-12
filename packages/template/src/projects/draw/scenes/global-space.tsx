import { FillSpace } from "@motion-script/core";
import { DrawDemoScene } from "./draw-demo";

/**
 * `global` (the default): all draw-command shapes are treated as one unit, so
 * the gradient spans the union bounds of the whole figure. The fill travels
 * with the shape as it drifts.
 */
export class GlobalSpaceScene extends DrawDemoScene {
    readonly space: FillSpace = 'global';
    readonly label = 'Fill Space — global';
}
