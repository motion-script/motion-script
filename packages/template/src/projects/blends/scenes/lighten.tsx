import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `lighten` blend mode fading in over the photo. */
export class LightenBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'lighten';
}
