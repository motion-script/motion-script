import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class BlurScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Blur',
        from: FX.blur(0),
        to: FX.blur(8),
    };
}
