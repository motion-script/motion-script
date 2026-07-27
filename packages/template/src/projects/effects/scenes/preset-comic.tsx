import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Comic',
        from: Presets.comic(0),
        to: Presets.comic(1),
    }));
