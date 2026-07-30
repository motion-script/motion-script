import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Radial Blur',
        from: FX.radialBlur(0),
        to: FX.radialBlur({ amount: 0.6, style: 'zoom', samples: 24 }),
    }));
