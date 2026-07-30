import { createScene } from "motion-script";
import { blueprint } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Blueprint',
        from: blueprint(0),
        to: blueprint(1),
    }));
