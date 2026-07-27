import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Threshold',
        from: FX.threshold({ level: 0.5, smoothness: 1 }),
        to: FX.threshold({ level: 0.5, smoothness: 0.02 }),
    }));
