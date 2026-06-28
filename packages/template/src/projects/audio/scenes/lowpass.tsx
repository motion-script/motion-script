import { AudioFilters } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { audioDemo } from "./audio-demo";

/** LowPassFilter: rolls off frequencies above the cutoff (muffled, bassy). */
export default createScene(audioDemo({
        label: 'Low-pass 500 Hz',
        filters: AudioFilters.lowpass(500),
    }));
