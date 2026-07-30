import { createScene } from "motion-script";
import { crt } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'CRT',
        from: crt(0),
        to: crt(1),
    }));
