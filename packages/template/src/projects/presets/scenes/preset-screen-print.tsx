import { createScene } from "motion-script";
import { screenPrint } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'ScreenPrint',
        from: screenPrint(0),
        to: screenPrint(1),
    }));
