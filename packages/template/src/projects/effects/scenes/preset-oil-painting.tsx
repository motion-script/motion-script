import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'OilPainting',
        from: Presets.oilPainting(0),
        to: Presets.oilPainting(1),
        compare: true,
    }));
