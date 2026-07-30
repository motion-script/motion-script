import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
    label: 'Wave',
    from: FX.wave({ amplitude: 0, wavelength: 90 }),
    to: FX.wave({ amplitude: 18, wavelength: 90, phase: 180 }),
}));
