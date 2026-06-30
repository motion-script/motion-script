import { AudioFilters } from "motion-script";
import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/** HighPassFilter: rolls off frequencies below the cutoff (thin, tinny). */
export default createScene(audioDemo({
        label: 'High-pass 2000 Hz',
        filters: AudioFilters.highpass(2000),
    }));
