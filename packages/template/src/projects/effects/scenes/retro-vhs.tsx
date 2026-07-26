import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

/** Composed look: vintage grade + chromatic aberration fringe. */
export default createScene(effectDemo({
        label: 'Retro VHS',
        from: FX.vintage({ amount: 0, warmth: 0 }).chromaticAberration(0),
        to: FX.vintage({ amount: 0.9, warmth: -0.2 }).chromaticAberration({ amount: 6, angle: 90 }),
    }));
