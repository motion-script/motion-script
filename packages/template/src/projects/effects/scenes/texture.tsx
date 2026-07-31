import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

// `paper.png` is a real surface scan, with scratches, dust and blotches, which
// is the kind of image the effect exists for. Any image works; the point is
// that the texture is yours rather than bundled with the library.
export default createScene(effectDemo({
    label: 'Texture',
    from: FX.texture({ src: './paper.png', amount: 0, scale: 1 }),
    to: FX.texture({ src: './paper.png', amount: 0.9, scale: 1, blend: 'overlay' }),
}));
