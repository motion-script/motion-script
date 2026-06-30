import { AudioFilters } from "motion-script";
import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/** LowPassFilter: rolls off frequencies above the cutoff (muffled, bassy). */
export default createScene(audioDemo({
        label: 'Low-pass 500 Hz',
        filters: AudioFilters.lowpass(500),
    }));
