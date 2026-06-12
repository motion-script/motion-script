import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `hard-light` blend mode fading in over the photo. */
export class HardLightBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'hard-light';
}
