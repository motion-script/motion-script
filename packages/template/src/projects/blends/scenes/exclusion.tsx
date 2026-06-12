import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `exclusion` blend mode fading in over the photo. */
export class ExclusionBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'exclusion';
}
