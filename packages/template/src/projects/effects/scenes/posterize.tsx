import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Posterize',
        from: FX.posterize(32),
        to: FX.posterize(4),
        compare: true,
    }));
