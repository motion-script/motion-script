import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Chalk',
        from: Presets.chalk(0),
        to: Presets.chalk(1),
        compare: true,
    }));
