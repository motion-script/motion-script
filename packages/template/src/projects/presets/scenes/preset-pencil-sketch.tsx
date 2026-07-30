import { createScene } from "motion-script";
import { pencilSketch } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'PencilSketch',
        from: pencilSketch(0),
        to: pencilSketch(1),
    }));
