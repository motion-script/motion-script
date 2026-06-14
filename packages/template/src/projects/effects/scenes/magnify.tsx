import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class MagnifyScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Magnify',
        from: FX.magnify(1),
        to: FX.magnify(1.8),
        background: true,
    };
}
