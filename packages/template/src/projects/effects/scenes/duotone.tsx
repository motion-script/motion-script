import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Duotone',
        from: FX.duotone({ amount: 0, shadows: '#12184a', highlights: '#ffd166' }),
        to: FX.duotone({ amount: 1, shadows: '#12184a', highlights: '#ffd166' }),
        compare: true,
    }));
