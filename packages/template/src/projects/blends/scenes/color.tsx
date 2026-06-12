import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `color` blend mode fading in over the photo. */
export class ColorBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'color';
}
