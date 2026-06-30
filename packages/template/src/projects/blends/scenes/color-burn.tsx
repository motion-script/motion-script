import { createScene } from "motion-script";
import { blendDemo } from "./blend-demo";

/** `color-burn` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "color-burn" }));
