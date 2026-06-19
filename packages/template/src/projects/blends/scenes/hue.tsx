import { createScene } from "@motion-script/core";
import { blendDemo } from "./blend-demo";

/** `hue` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "hue" }));
