import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Color Adjustment',
        from: FX.colorAdjustment({ contrast: 1, saturation: 1, temperature: 0 }),
        to: FX.colorAdjustment({ contrast: 1.35, saturation: 1.5, temperature: 0.5, shadows: 0.3 }),
    }));
