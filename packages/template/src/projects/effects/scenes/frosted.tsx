import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

/** Composed look: grayscale + blur stacked into one chain. */
export default createScene(effectDemo({
        label: 'Frosted',
        from: FX.grayscale(0).blur(0),
        to: FX.grayscale(1).blur(6),
    }));
