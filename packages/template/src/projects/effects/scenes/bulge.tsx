import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Bulge',
        from: FX.bulge(0),
        to: FX.bulge(0.6),
    }));
