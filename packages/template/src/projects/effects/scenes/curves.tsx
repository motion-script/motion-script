import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Curves',
        from: FX.curves({ points: [[0, 0], [0.5, 0.5], [1, 1]] }),
        to: FX.curves({ points: [[0, 0.15], [0.5, 0.55], [1, 1]] }),
    }));
