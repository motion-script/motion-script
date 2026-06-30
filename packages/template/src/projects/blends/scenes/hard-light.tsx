import { createScene } from "motion-script";
import { blendDemo } from "./blend-demo";

/** `hard-light` blend mode fading in over the photo. */
export default createScene(blendDemo({ mode: "hard-light" }));
