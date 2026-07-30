import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
    label: 'Kaleidoscope',
    // `segments` is discrete, so `amount` is what ramps the fold on — tweening
    // the fold count would snap rather than build.
    from: FX.kaleidoscope({ segments: 6, amount: 0 }),
    to: FX.kaleidoscope({ segments: 6, amount: 1, angle: 30 }),
}));
