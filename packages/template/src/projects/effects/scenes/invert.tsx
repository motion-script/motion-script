import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class InvertScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Invert',
        from: FX.invert('rgba', 0),
        to: FX.invert('rgba', 1),
    };
}
