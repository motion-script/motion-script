import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

// Fades into the Game Boy palette via `amount`, since the palette itself is a
// discrete choice that can't be interpolated.
export default createScene(effectDemo({
        label: 'Bit Crush',
        from: FX.bitCrush({ palette: 'gameboy', amount: 0 }),
        to: FX.bitCrush({ palette: 'gameboy', amount: 1 }),
    }));
