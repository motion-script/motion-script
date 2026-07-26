import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'CRT',
        from: Presets.crt(0),
        to: Presets.crt(1),
        compare: true,
    }));
