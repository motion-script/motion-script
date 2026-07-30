import { createScene } from "motion-script";
import { newsprint } from "./recipes";
import { effectDemo } from "../../../shared/effect-demo";

export default createScene(effectDemo({
        label: 'Newsprint',
        from: newsprint(0),
        to: newsprint(1),
    }));
