import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Oil Paint',
        from: FX.oilPaint(0),
        to: FX.oilPaint(4),
        compare: true,
    }));
