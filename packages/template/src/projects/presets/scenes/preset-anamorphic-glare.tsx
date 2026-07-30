import { createScene } from "motion-script";
import { anamorphicGlare } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'AnamorphicGlare',
        from: anamorphicGlare(0),
        to: anamorphicGlare(1),
    }));
