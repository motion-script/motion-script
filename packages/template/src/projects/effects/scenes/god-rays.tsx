import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'God Rays',
        from: FX.godRays({ intensity: 0, threshold: 0.5, length: 0.7, center: { x: 0.72, y: 0.18 } }),
        to: FX.godRays({ intensity: 2, threshold: 0.5, length: 0.7, center: { x: 0.72, y: 0.18 } }),
    }));
