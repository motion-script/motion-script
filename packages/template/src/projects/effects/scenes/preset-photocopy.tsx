import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Photocopy',
        from: Presets.photocopy(0),
        to: Presets.photocopy(1),
        compare: true,
    }));
