import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Invert',
        from: FX.invert('rgba', 0),
        to: FX.invert('rgba', 1),
        compare: true,
    }));
