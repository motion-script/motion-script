import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

/** Composed look: vintage grade + chromatic aberration fringe. */
export default createScene(effectDemo({
        label: 'Retro VHS',
        from: FX.vintage(0, 0).chromaticAberration(0, 0),
        to: FX.vintage(0.9, -0.2).chromaticAberration(6, 90),
    }));
