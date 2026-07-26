import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Vintage',
        from: FX.vintage({ amount: 0, warmth: 0 }),
        to: FX.vintage({ amount: 1, warmth: 0.4 }),
        compare: true,
    }));
