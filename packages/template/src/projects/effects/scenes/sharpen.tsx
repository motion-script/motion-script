import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Sharpen',
        from: FX.sharpen(0),
        to: FX.sharpen({ amount: 2.5, radius: 2 }),
    }));
