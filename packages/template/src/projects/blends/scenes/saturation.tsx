import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `saturation` blend mode fading in over the photo. */
export class SaturationBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'saturation';
}
