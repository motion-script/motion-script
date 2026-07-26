import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'GameBoy',
        from: Presets.gameboy(0),
        to: Presets.gameboy(1),
        compare: true,
    }));
