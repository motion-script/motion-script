import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'ThermalPrint',
        from: Presets.thermalPrint(0),
        to: Presets.thermalPrint(1),
        compare: true,
    }));
