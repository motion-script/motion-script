import { createScene } from "motion-script";
import { thermalPrint } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'ThermalPrint',
        from: thermalPrint(0),
        to: thermalPrint(1),
    }));
