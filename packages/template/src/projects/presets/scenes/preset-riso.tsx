import { createScene } from "motion-script";
import { riso } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Riso',
        from: riso(0),
        to: riso(1),
    }));
