import { createScene } from "motion-script";
import { blendDemo } from "./blend-demo";

/** `difference` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "difference" }));
