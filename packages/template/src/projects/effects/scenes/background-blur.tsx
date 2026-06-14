import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

/** Figma-style backdrop blur — `blur` with `{ backdrop: true }` blurs the content
 *  beneath the node, clipped to its silhouette, leaving the node's edges sharp. */
export class BackgroundBlurScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Backdrop blur',
        from: FX.blur(0, { backdrop: true }),
        to: FX.blur(16, { backdrop: true }),
        background: true,
    };
}
