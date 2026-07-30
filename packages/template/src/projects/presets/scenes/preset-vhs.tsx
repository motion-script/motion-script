import { createScene } from "motion-script";
import { vhs } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'VHS',
        from: vhs(0),
        to: vhs(1),
    }));
