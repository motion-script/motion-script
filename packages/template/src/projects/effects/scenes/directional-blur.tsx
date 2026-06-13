import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class DirectionalBlurScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Directional blur',
        from: FX.directionalBlur(0, 0),
        to: FX.directionalBlur(0, 40),
        compare: true,
    };
}
