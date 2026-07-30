import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Magnify',
        from: FX.magnify(1),
        to: FX.magnify(1.8),
        background: true,
    }));
