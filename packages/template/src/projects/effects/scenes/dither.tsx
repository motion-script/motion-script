import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
    label: 'Dither',
    from: FX.dither({ levels: 32, matrix: 8, scale: 3 }),
    to: FX.dither({ levels: 2, matrix: 8, scale: 3 }),
    compare: true,
}));
