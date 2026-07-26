import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Riso',
        from: Presets.riso(0),
        to: Presets.riso(1),
        compare: true,
    }));
