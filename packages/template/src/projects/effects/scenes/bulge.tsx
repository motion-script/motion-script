import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class BulgeScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Bulge',
        from: FX.bulge(0),
        to: FX.bulge(0.6),
    };
}
