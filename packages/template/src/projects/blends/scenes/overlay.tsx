import { BlendMode } from "@motion-script/core";
import { BlendDemoScene } from "./blend-demo";

/** `overlay` blend mode fading in over the photo. */
export class OverlayBlendScene extends BlendDemoScene {
    readonly mode: BlendMode = 'overlay';
}
