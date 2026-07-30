import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Posterize',
        from: FX.posterize(32),
        to: FX.posterize(4),
    }));
