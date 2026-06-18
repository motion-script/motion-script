import { Effects } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class DirectionalBlurScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Directional blur',
        from: Effects.directionalBlur(0, 0),
        to: Effects.directionalBlur(0, 40),
        compare: true,
    };
}
