import { createScene } from "motion-script";
import { gameboy } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'GameBoy',
        from: gameboy(0),
        to: gameboy(1),
    }));
