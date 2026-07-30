import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Streak',
        from: FX.streak({ intensity: 0, threshold: 0.55, length: 200 }),
        to: FX.streak({ intensity: 2.2, threshold: 0.55, length: 200 }),
    }));
