import { Effects as FX } from "@motion-script/core";
import { EffectDemoScene, EffectDemoSpec } from "./effect-demo";

export class PixelateScene extends EffectDemoScene {
    readonly spec: EffectDemoSpec = {
        label: 'Pixelate',
        // Block counts across the node (AE Mosaic). Start coarse → resolve sharp.
        to: FX.pixelate({ horizontalBlocks: 20, verticalBlocks: 16, sharpColors: true }),
        from: FX.pixelate({ horizontalBlocks: 1920, verticalBlocks: 1080, sharpColors: true }),
        compare: true,
    };
}
