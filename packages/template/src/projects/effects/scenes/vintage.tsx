import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class VintageScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Vintage',
        from: FX.vintage(0, 0),
        to: FX.vintage(1, 0.4),
        compare: true,
    };
}
