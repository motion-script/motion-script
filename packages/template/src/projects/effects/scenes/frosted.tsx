import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

/** Composed look: grayscale + blur stacked into one chain. */
export class FrostedScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Frosted',
        from: FX.grayscale(0).blur(0),
        to: FX.grayscale(1).blur(6),
    };
}
