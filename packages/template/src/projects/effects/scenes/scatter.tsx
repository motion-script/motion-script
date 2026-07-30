import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Scatter',
        from: FX.scatter(0),
        to: FX.scatter(12),
    }));
