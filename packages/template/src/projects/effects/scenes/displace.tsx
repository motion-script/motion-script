import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

/**
 * Driven by `paper.png` — the same texture the `texture` effect overlays, used
 * here as a *map* instead. Reading its luminance warps by the paper's own fibre,
 * which is the "printed on something uneven" look.
 */
export default createScene(effectDemo({
    label: 'Displace',
    from: FX.displace({ src: './paper.png', amount: 0, channel: 'luminance' }),
    to: FX.displace({ src: './paper.png', amount: 24, channel: 'luminance', scale: 2 }),
}));
