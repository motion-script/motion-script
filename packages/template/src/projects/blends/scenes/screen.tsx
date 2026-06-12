import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `screen` blend mode fading in over the photo. */
export class ScreenBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'screen';
}
