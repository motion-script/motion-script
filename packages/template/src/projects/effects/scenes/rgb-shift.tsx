import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'RGB Shift',
        from: FX.rgbShift(0),
        to: FX.rgbShift(18),
    }));
