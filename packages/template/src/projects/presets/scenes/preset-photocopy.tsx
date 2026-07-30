import { createScene } from "motion-script";
import { photocopy } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Photocopy',
        from: photocopy(0),
        to: photocopy(1),
    }));
