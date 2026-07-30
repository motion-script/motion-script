import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

// Uses an image the project already ships. Any image works — the point of the
// effect is that the texture is yours, not bundled.
export default createScene(effectDemo({
    label: 'Texture',
    from: FX.texture({ src: './halftone.jpg', amount: 0, scale: 3 }),
    to: FX.texture({ src: './halftone.jpg', amount: 0.85, scale: 3, blend: 'overlay' }),
}));
