import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Vintage',
        from: FX.vintage(0, 0),
        to: FX.vintage(1, 0.4),
        compare: true,
    }));
