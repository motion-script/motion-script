import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

/** Figma-style backdrop blur — `blur` with `{ mode: "backdrop" }` blurs the content
 *  beneath the node, clipped to its silhouette, leaving the node's edges sharp. */
export default createScene(effectDemo({
        label: 'Backdrop blur',
        from: FX.blur({ radius: 0, mode: "backdrop" }),
        to: FX.blur({ radius: 16, mode: "backdrop" }),
        background: true,
    }));
