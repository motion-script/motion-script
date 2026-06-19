import { Effects as FX } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Chromatic aberration',
        from: FX.chromaticAberration(0, 0),
        to: FX.chromaticAberration(8, 0),
        compare: true,
    }));
