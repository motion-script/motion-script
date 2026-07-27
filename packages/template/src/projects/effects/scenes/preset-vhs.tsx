import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'VHS',
        from: Presets.vhs(0),
        to: Presets.vhs(1),
    }));
