import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

// `paper` is the one preset that needs an asset. Any image works — swap it for
// a weave or a denim scan and the same recipe becomes canvas or denim.
export default createScene(effectDemo({
        label: 'Paper',
        from: Presets.paper({ amount: 0, src: './halftone.jpg', scale: 2 }),
        to: Presets.paper({ amount: 1, src: './halftone.jpg', scale: 2 }),
        compare: true,
    }));
