import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

/**
 * Hue rotation is luma-preserving, so the samples change colour without any of
 * them changing how light they read — which is the point of doing it as a
 * rotation rather than a channel swap.
 */
export default createScene(effectDemo({
    label: 'Hue',
    from: FX.colorAdjustment({ hue: 0 }),
    to: FX.colorAdjustment({ hue: 260 }),
}));
