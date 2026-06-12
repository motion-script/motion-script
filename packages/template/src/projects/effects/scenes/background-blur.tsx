import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class BackgroundBlurScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Background blur',
        from: FX.backgroundBlur(0),
        to: FX.backgroundBlur(16),
        background: true,
    };
}
