import { AudioFilters, ramp } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { audioDemo } from "./audio-demo";

/**
 * Time-varying filter param: the high-pass cutoff sweeps 200 Hz → 4000 Hz over
 * 2 seconds, then holds. Proves the curve machinery is filter-agnostic — the same
 * `ramp` that drives volume drives a biquad's frequency.
 */
export default createScene(audioDemo({
        label: 'High-pass sweep',
        filters: AudioFilters.highpass(ramp(200, 4000, 2).hold()),
        clip: 4,
    }));
