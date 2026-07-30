import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Vignette',
        from: FX.vignette(0),
        to: FX.vignette(0.9),
    }));
