import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
    label: 'Halftone',
    from: FX.halftone(0),
    to: FX.halftone({ size: 16, angle: 45, shape: 'dot' }),
}));
