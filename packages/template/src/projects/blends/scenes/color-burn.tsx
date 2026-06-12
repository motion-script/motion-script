import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `color-burn` blend mode fading in over the photo. */
export class ColorBurnBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'color-burn';
}
