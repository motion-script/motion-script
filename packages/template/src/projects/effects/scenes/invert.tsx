import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Invert',
        from: FX.invert(0),
        to: FX.invert(1),
        compare: true,
    }));
