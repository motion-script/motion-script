import { createScene } from "@motion-script/core";
import { blendDemo } from "./blend-demo";

/** `multiply` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "multiply" }));
