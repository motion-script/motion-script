import { Effects } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Directional blur',
        from: Effects.directionalBlur(0),
        to: Effects.directionalBlur(40),
        compare: true,
    }));
