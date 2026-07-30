import { createScene } from "motion-script";
import { neon } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Neon',
        from: neon(0),
        to: neon(1),
    }));
