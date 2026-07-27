import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Block Displace',
        from: FX.blockDisplace({ amount: 0, size: 24, density: 0.5 }),
        to: FX.blockDisplace({ amount: 90, size: 24, density: 0.5 }),
    }));
