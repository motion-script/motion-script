import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Scatter',
        from: FX.scatter(0),
        to: FX.scatter(12),
        compare: true,
    }));
