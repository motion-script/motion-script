import { FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class ChromaticAberrationScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Chromatic aberration',
        from: FX.chromaticAberration(0, 0),
        to: FX.chromaticAberration(8, 0),
        compare: true,
    };
}
