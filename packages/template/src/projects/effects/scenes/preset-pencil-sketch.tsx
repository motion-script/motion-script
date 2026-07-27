import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'PencilSketch',
        from: Presets.pencilSketch(0),
        to: Presets.pencilSketch(1),
    }));
