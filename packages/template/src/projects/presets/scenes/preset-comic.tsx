import { createScene } from "motion-script";
import { comic } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Comic',
        from: comic(0),
        to: comic(1),
    }));
