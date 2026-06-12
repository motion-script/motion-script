import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `luminosity` blend mode fading in over the photo. */
export class LuminosityBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'luminosity';
}
