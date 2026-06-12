import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `multiply` blend mode fading in over the photo. */
export class MultiplyBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'multiply';
}
