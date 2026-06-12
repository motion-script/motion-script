import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `normal` blend mode fading in over the photo. */
export class NormalBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'normal';
}
