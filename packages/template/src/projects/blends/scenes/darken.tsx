import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `darken` blend mode fading in over the photo. */
export class DarkenBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'darken';
}
