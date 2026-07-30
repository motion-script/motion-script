import { createScene } from "motion-script";
import { chalk } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Chalk',
        from: chalk(0),
        to: chalk(1),
    }));
