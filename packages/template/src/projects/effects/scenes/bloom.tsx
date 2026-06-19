import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Bloom',
        from: FX.bloom(0.6, 12, 0),
        to: FX.bloom(0.6, 24, 1.5),
        compare: true,
    }));
