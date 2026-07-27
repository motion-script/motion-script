import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Pixelate',
        // Block counts across the node (AE Mosaic). Start coarse → resolve sharp.
        to: FX.pixelate({ blocks: { x: 20, y: 16 }, sharpColors: true }),
        from: FX.pixelate({ blocks: { x: 1920, y: 1080 }, sharpColors: true }),
    }));
