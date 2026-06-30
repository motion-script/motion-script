import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/** The unfiltered clip, as a reference to compare the filtered scenes against. */
export default createScene(audioDemo({
        label: 'Original',
    }));
