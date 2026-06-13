import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class ScatterScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Scatter',
        from: FX.scatter(0),
        to: FX.scatter(12),
        compare: true,
    };
}
