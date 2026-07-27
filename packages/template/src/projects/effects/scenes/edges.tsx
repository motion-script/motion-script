import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

export default createScene(effectDemo({
        label: 'Edges',
        // strength 0 is a true no-op (the handler skips the pass), so the "before"
        // cell shows the photo rather than a near-black edge map.
        from: FX.edges(0),
        to: FX.edges(3),
    }));
