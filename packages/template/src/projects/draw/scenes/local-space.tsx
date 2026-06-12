import { FillSpace } from "@motion-script/core";
import { DrawDemoScene } from "./draw-demo";

/**
 * `local`: each draw-command sub-shape is painted on its own, so the gradient
 * resolves against every piece's individual bounds — the rect, the ellipse and
 * the path each get their own full sweep rather than one shared across the
 * figure.
 */
export class LocalSpaceScene extends DrawDemoScene {
    readonly space: FillSpace = 'local';
    readonly label = 'Fill Space — local';
}
