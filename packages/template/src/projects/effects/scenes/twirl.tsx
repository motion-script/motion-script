import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
    label: 'Twirl',
    from: FX.twirl(0),
    to: FX.twirl({ angle: 220, radius: 0.9 }),
}));
