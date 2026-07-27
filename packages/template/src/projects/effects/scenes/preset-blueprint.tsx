import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Blueprint',
        from: Presets.blueprint(0),
        to: Presets.blueprint(1),
    }));
