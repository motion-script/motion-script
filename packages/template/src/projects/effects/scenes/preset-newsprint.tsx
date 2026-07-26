import { Presets } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Newsprint',
        from: Presets.newsprint(0),
        to: Presets.newsprint(1),
        compare: true,
    }));
