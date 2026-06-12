import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `hue` blend mode fading in over the photo. */
export class HueBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'hue';
}
