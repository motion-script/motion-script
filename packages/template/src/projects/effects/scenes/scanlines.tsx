import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Scanlines',
        from: FX.scanlines({ darkness: 0, spacing: 6 }),
        to: FX.scanlines({ darkness: 0.85, spacing: 6 }),
    }));
