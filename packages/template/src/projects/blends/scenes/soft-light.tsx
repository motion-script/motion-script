import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `soft-light` blend mode fading in over the photo. */
export class SoftLightBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'soft-light';
}
