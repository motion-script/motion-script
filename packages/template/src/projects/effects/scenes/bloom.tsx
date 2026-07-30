import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Bloom',
        from: FX.bloom({ threshold: 0.6, radius: 12, intensity: 0 }),
        to: FX.bloom({ threshold: 0.6, radius: 24, intensity: 1.5 }),
    }));
