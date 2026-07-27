import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Glitch',
        from: Presets.glitch(0),
        to: Presets.glitch(1),
    }));
