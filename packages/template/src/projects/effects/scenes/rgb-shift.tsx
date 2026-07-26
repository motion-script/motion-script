import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'RGB Shift',
        from: FX.rgbShift(0),
        to: FX.rgbShift(18),
        compare: true,
    }));
