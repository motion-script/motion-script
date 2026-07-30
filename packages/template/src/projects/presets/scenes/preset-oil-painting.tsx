import { createScene } from "motion-script";
import { oilPainting } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'OilPainting',
        from: oilPainting(0),
        to: oilPainting(1),
    }));
