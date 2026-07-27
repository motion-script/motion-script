import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'ScreenPrint',
        from: Presets.screenPrint(0),
        to: Presets.screenPrint(1),
    }));
