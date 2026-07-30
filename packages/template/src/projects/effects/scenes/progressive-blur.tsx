import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
    label: 'Progressive blur',
    from: FX.progressiveBlur({ radius: 0, angle: 90 }),
    // Sharp at the top, dissolving toward the bottom of each cell.
    to: FX.progressiveBlur({ radius: 28, angle: 90, start: 0.15, end: 0.95 }),
}));
