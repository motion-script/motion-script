import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class PosterizeScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Posterize',
        from: FX.posterize(32),
        to: FX.posterize(4),
        compare: true,
    };
}
