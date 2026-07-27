import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'AnamorphicGlare',
        from: Presets.anamorphicGlare(0),
        to: Presets.anamorphicGlare(1),
    }));
