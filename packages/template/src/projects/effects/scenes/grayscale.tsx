import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Grayscale',
        from: FX.grayscale(0),
        to: FX.grayscale(1),
    }));
