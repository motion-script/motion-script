import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `difference` blend mode fading in over the photo. */
export class DifferenceBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'difference';
}
