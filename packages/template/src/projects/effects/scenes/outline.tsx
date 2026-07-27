import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

// `position: 'inside'` rather than the default 'outside': this demo's card is a
// full-bleed image inside a clipping parent, so an outward band would have
// nowhere to land. The e2e `effect-outline` scene covers the outside variant,
// where it belongs — around a text silhouette with room around it.
export default createScene(effectDemo({
        label: 'Outline',
        from: FX.outline({ width: 0, color: '#ff2e63', position: 'inside' }),
        to: FX.outline({ width: 24, color: '#ff2e63', position: 'inside' }),
    }));
