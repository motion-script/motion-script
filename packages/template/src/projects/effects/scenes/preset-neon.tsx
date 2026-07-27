import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Neon',
        from: Presets.neon(0),
        to: Presets.neon(1),
        compare: true,
    }));
