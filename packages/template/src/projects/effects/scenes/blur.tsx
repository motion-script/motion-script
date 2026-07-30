import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Blur',
        from: FX.blur(0),
        to: FX.blur(8),
    }));
