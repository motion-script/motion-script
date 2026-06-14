import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class GrayscaleScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Grayscale',
        from: FX.grayscale(0),
        to: FX.grayscale(1),
        compare: true,
    };
}
