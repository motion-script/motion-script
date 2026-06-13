import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class BloomScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Bloom',
        from: FX.bloom(0.6, 12, 0),
        to: FX.bloom(0.6, 24, 1.5),
        compare: true,
    };
}
