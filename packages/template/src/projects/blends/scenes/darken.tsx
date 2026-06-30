import { createScene } from "motion-script";
import { blendDemo } from "./blend-demo";

/** `darken` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "darken" }));
