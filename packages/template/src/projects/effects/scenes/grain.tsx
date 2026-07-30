import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Grain',
        from: FX.grain({ amount: 0, animated: true }),
        to: FX.grain({ amount: 0.45, animated: true }),
    }));
