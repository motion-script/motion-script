import { createScene } from "motion-script";
import { paper } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

// `paper` is the one recipe that needs an asset. Any image works — swap it for
// a weave or a denim scan and the same recipe becomes canvas or denim.
export default createScene(effectDemo({
        label: 'Paper',
        from: paper('./halftone.jpg', 0, 2),
        to: paper('./halftone.jpg', 1, 2),
    }));
