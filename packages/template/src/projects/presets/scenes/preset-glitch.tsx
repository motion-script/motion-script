import { createScene } from "motion-script";
import { glitch } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Glitch',
        from: glitch(0),
        to: glitch(1),
    }));
