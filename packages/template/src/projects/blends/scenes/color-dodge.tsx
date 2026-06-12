import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `color-dodge` blend mode fading in over the photo. */
export class ColorDodgeBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'color-dodge';
}
